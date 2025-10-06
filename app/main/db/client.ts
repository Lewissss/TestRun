import { PrismaClient } from '@prisma/client';

// Ensure a single Prisma instance across reloads (e.g. during development)
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
