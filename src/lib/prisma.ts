import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getDatabaseUrl = () => {
  let url = process.env.DATABASE_URL || '';
  if (process.env.DB_SSL === 'false') {
    try {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.set('sslmode', 'disable');
      parsedUrl.searchParams.delete('channel_binding');
      return parsedUrl.toString();
    } catch {
      // Fallback regex replacement
      if (url.includes('sslmode=')) {
        url = url.replace(/sslmode=[^&]+/g, 'sslmode=disable');
      } else {
        url += (url.includes('?') ? '&' : '?') + 'sslmode=disable';
      }
      url = url.replace(/[&?]channel_binding=[^&]+/g, '');
      return url;
    }
  }
  return url;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

