import { Controller, Post, Get, Param, Body, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportsService, CreateExportDto } from './exports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Exports')
@Controller('api/v1/exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Queue a new CSV or XLSX export job' })
  async createExport(@CurrentUser() user: any, @Body() dto: CreateExportDto) {
    return this.exportsService.createExport(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List recent exports for the current user' })
  async getExports(@CurrentUser() user: any) {
    return this.exportsService.getExports(user.id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the generated export spreadsheet' })
  async downloadExport(@Param('id') id: string, @Res() res: Response) {
    const fileInfo = await this.exportsService.getExportFile(id);
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
    res.sendFile(fileInfo.filePath);
  }
}
