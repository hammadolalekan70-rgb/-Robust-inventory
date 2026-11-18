import { z } from 'zod';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');
export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters');
export const personName = z.string().trim().min(2, 'Name is too short').max(80);
export const directoryName = z.string().trim().min(2, 'Name is too short').max(120);

export const paginationQuery = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200)
});

export const setupAdminSchema = z.object({
  name: personName,
  email: emailSchema,
  password: passwordSchema
});

export const loginCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit verification code')
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(300),
  password: passwordSchema
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema
});

export const createUserSchema = z.object({
  name: personName,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['boss', 'staff'])
});

export const updateUserSchema = z
  .object({
    name: personName.optional(),
    email: emailSchema.optional(),
    role: z.enum(['boss', 'staff']).optional()
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied');

export const resetUserPasswordSchema = z.object({ password: passwordSchema });

export const listUsersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['boss', 'staff']).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  ...paginationQuery
});

export const productCreateSchema = z.object({
  name: directoryName,
  confirmNew: z.boolean().optional()
});

export const productUpdateSchema = z.object({ name: directoryName });

export const listProductsQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  withUsage: z.enum(['true', 'false']).default('false'),
  ...paginationQuery
});

export const supplierCreateSchema = z.object({
  name: directoryName,
  phone: z.string().trim().max(40).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  confirmNew: z.boolean().optional()
});

export const supplierUpdateSchema = z
  .object({
    name: directoryName.optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(200).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, 'No changes supplied');

export const listSuppliersQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  withUsage: z.enum(['true', 'false']).default('false'),
  ...paginationQuery
});

export const duplicateQuery = z.object({ name: z.string().trim().min(1).max(120) });

const purchaseItemSchema = z
  .object({
    productId: objectId.optional(),
    newProduct: z
      .object({
        name: directoryName,
        confirmNew: z.boolean().optional()
      })
      .optional(),
    quantity: z.union([z.string(), z.number()]),
    unitPrice: z.union([z.string(), z.number()]),
    unitLabel: z.string().trim().max(20).optional().default('')
  })
  .refine((v) => Boolean(v.productId) !== Boolean(v.newProduct), {
    message: 'Provide either an existing product or a new product name'
  });

export const purchasePayloadSchema = z
  .object({
    purchaseDate: dateOnly.optional(),
    supplierId: objectId.optional(),
    newSupplier: z
      .object({
        name: directoryName,
        phone: z.string().trim().max(40).optional().default(''),
        address: z.string().trim().max(200).optional().default(''),
        confirmNew: z.boolean().optional()
      })
      .optional(),
    items: z.array(purchaseItemSchema).min(1, 'Add at least one item').max(100),
    notes: z.string().trim().max(500).optional().default(''),
    removeAttachmentIds: z.array(objectId).max(20).optional(),
    reason: z.string().trim().max(300).optional()
  })
  .refine((v) => Boolean(v.supplierId) !== Boolean(v.newSupplier), {
    message: 'Provide either an existing supplier or a new supplier'
  });

export const listPurchasesQuery = z.object({
  q: z.string().trim().max(120).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  productId: objectId.optional(),
  supplierId: objectId.optional(),
  staffId: objectId.optional(),
  status: z.enum(['active', 'deleted', 'all']).default('active'),
  sort: z.enum(['purchaseDate', 'createdAt', 'totalKobo', 'transactionNumber']).default('purchaseDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
  ...paginationQuery
});

export const idParam = z.object({ id: objectId });

export const dateParam = z.object({ date: dateOnly });

export const rangeQuery = z.object({
  from: dateOnly,
  to: dateOnly,
  period: z.enum(['daily', 'weekly', 'monthly', 'custom']).optional()
});

export const optionalRangeQuery = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'custom']).optional()
});

export const priceHistoryQuery = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  supplierId: objectId.optional(),
  ...paginationQuery
});

export const auditQuery = z.object({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  actorId: objectId.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  ...paginationQuery
});

export const activityQuery = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional()
});
