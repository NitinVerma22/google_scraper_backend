import { Controller, Post, Get, Body, Param, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { AutonomousService } from './autonomous.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

export class StartAutonomousDiscoveryDto {
  country?: string;
  state?: string;
  city?: string;
  maxBudgetUSD?: number;
  targetCount?: number;
  maxRuntimeMinutes?: number;
  dryRun?: boolean;
}

@Controller('api/v1/autonomous')
export class AutonomousController {
  constructor(private readonly autonomousService: AutonomousService) {}

  @UseGuards(JwtAuthGuard)
  @Post('dry-run')
  async dryRunDiscovery(@Body() dto: StartAutonomousDiscoveryDto) {
    return this.autonomousService.dryRunAutonomousDiscovery(
      dto.country || 'India',
      dto.state || 'Uttar Pradesh',
      dto.city || 'Lucknow',
      dto.targetCount || 1000,
      dto.maxBudgetUSD || 25.0,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('start')
  async startAutonomousDiscovery(@CurrentUser() user: any, @Body() dto: StartAutonomousDiscoveryDto) {
    const userId = user?.id || 'default-user-id';
    return this.autonomousService.startAutonomousDiscovery(
      userId,
      dto.country || 'India',
      dto.state || 'Uttar Pradesh',
      dto.city || 'Lucknow',
      dto.maxBudgetUSD || 25.0,
      dto.targetCount || 1000,
      dto.maxRuntimeMinutes || 120,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pause')
  pauseDiscovery(@Param('id') id: string) {
    return this.autonomousService.pauseDiscovery(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/resume')
  resumeDiscovery(@Param('id') id: string) {
    return this.autonomousService.resumeDiscovery(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/stop')
  stopDiscovery(@Param('id') id: string) {
    return this.autonomousService.stopDiscovery(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/retry-failed')
  retryFailedTasks(@Param('id') id: string) {
    return this.autonomousService.retryFailedTasks(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/status')
  getDiscoveryStatus(@Param('id') id: string) {
    return this.autonomousService.getDiscoveryStatus(id);
  }

  @Sse(':id/events')
  streamEvents(@Param('id') id: string): Observable<MessageEvent> {
    return this.autonomousService.getEventStream(id).pipe(
      map((data) => ({
        data: JSON.stringify(data),
      })),
    );
  }
}
