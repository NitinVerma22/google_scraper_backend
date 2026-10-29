import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  async onModuleInit() {
    if (process.env.DATABASE_DISABLED === 'true' || !process.env.DATABASE_URL) {
      this.logger.warn(
        'Database is disabled or DATABASE_URL is not set; database-backed endpoints will not work.',
      );
      return;
    }

    try {
      await this.$connect();
      this.connected = true;
      this.logger.log('Successfully connected to PostgreSQL database (leadgen_db)');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
      this.logger.log('Disconnected from PostgreSQL database');
    }
  }
}
