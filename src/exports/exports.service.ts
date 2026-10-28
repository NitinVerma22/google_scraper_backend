import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import * as fs from 'fs';
import * as path from 'path';

export interface CreateExportDto {
  format: 'CSV' | 'XLSX';
  selectedFields?: string[];
  businessIds?: string[];
  jobId?: string;
  filterCriteria?: any;
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly storageDir = path.resolve(process.cwd(), 'storage', 'exports');

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async createExport(userId: string, dto: CreateExportDto) {
    const exportJob = await this.prisma.exportJob.create({
      data: {
        userId,
        status: 'PROCESSING',
        format: dto.format,
        selectedFields: dto.selectedFields || ['name', 'phone', 'website', 'rating', 'city', 'formattedAddress'],
        filterCriteria: dto.filterCriteria || (dto.jobId ? { jobId: dto.jobId } : null),
      },
    });

    // Execute generation asynchronously
    setImmediate(async () => {
      await this.processExport(exportJob.id, dto);
    });

    return exportJob;
  }

  private async processExport(exportId: string, dto: CreateExportDto) {
    try {
      const where: any = {};
      if (dto.businessIds && dto.businessIds.length > 0) {
        where.id = { in: dto.businessIds };
      } else if (dto.jobId) {
        where.jobResults = { some: { jobId: dto.jobId } };
      }

      const records = await this.prisma.businessRecord.findMany({
        where,
        take: 5000,
        orderBy: { createdAt: 'desc' },
      });

      const fields = dto.selectedFields?.length ? dto.selectedFields : ['name', 'phone', 'website', 'rating', 'formattedAddress', 'city'];
      const timestamp = Date.now();
      const fileName = `export_${exportId}_${timestamp}.${dto.format.toLowerCase()}`;
      const filePath = path.join(this.storageDir, fileName);

      const rows = records.map((rec) => {
        const row: Record<string, any> = {};
        for (const f of fields) {
          row[f] = (rec as any)[f] ?? 'N/A';
        }
        return row;
      });

      if (dto.format === 'CSV') {
        const csvData = stringify(rows, { header: true });
        fs.writeFileSync(filePath, csvData);
      } else {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Business Leads');
        worksheet.columns = fields.map((f) => ({
          header: f.toUpperCase(),
          key: f,
          width: 25,
        }));
        for (const row of rows) {
          worksheet.addRow(row);
        }
        await workbook.xlsx.writeFile(filePath);
      }

      await this.prisma.exportJob.update({
        where: { id: exportId },
        data: {
          status: 'COMPLETED',
          recordCount: records.length,
          fileName,
          fileUrl: `/api/v1/exports/${exportId}/download`,
          completedAt: new Date(),
        },
      });

      this.logger.log(`Export ${exportId} completed successfully with ${records.length} records`);
    } catch (err: any) {
      this.logger.error(`Export ${exportId} failed: ${err.message}`);
      await this.prisma.exportJob.update({
        where: { id: exportId },
        data: {
          status: 'FAILED',
          errorMessage: err.message,
          completedAt: new Date(),
        },
      });
    }
  }

  async getExports(userId: string) {
    return this.prisma.exportJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async getExportFile(exportId: string) {
    const job = await this.prisma.exportJob.findUnique({
      where: { id: exportId },
    });

    if (!job || !job.fileName) {
      throw new NotFoundException('Export file not found or still processing');
    }

    const filePath = path.join(this.storageDir, job.fileName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Export file does not exist on disk');
    }

    return {
      filePath,
      fileName: job.fileName,
      mimeType: job.format === 'CSV' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
}
