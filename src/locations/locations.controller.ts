import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Locations')
@Controller('api/v1/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('countries')
  @ApiOperation({ summary: 'List supported countries for cascading dropdowns' })
  getCountries() {
    return this.locationsService.getCountries();
  }

  @Get('states')
  @ApiOperation({ summary: 'List states or regions within a country' })
  getStates(@Query('country') country: string) {
    return this.locationsService.getStates(country);
  }

  @Get('cities')
  @ApiOperation({ summary: 'List cities within a country and state' })
  getCities(@Query('country') country: string, @Query('state') state: string) {
    return this.locationsService.getCities(country, state);
  }

  @Get('geocode')
  @ApiOperation({ summary: 'Geocode an address to get latitude and longitude' })
  async geocode(@Query('address') address: string) {
    return this.locationsService.geocode(address);
  }
}
