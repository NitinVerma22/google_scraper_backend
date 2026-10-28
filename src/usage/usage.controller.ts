import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('API Usage Monitoring')
@Controller('api/v1/usage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get total API requests, costs, and endpoint breakdown' })
  async getUsageSummary() {
    return this.usageService.getUsageSummary();
  }
}
