import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BusinessesService, BusinessQueryDto } from './businesses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Businesses')
@Controller('api/v1/businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search and filter business directory records with pagination' })
  async getBusinesses(@Query() query: any) {
    const parsedQuery: BusinessQueryDto = {
      ...query,
      hasPhone: query.hasPhone === 'true' ? true : query.hasPhone === 'false' ? false : undefined,
      hasWebsite: query.hasWebsite === 'true' ? true : query.hasWebsite === 'false' ? false : undefined,
      minRating: query.minRating !== undefined ? parseFloat(query.minRating) : undefined,
      maxRating: query.maxRating !== undefined ? parseFloat(query.maxRating) : undefined,
      minReviews: query.minReviews !== undefined ? parseInt(query.minReviews, 10) : undefined,
      maxReviews: query.maxReviews !== undefined ? parseInt(query.maxReviews, 10) : undefined,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    };
    return this.businessesService.getBusinesses(parsedQuery);
  }

  @Get('filters')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get saved filter presets for user' })
  async getSavedFilters(@CurrentUser() user: any) {
    return this.businessesService.getSavedFilters(user.id);
  }

  @Post('filters')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save a filter preset' })
  async saveFilter(@CurrentUser() user: any, @Body() body: { name: string; filterConfiguration: any }) {
    return this.businessesService.saveFilter(user.id, body.name, body.filterConfiguration);
  }

  @Delete('filters/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a saved filter preset' })
  async deleteFilter(@CurrentUser() user: any, @Param('id') id: string) {
    return this.businessesService.deleteFilter(user.id, id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get comprehensive details of a single business listing' })
  async getBusinessById(@Param('id') id: string) {
    return this.businessesService.getBusinessById(id);
  }
}
