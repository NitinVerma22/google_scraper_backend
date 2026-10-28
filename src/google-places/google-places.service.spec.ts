import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GooglePlacesService } from './google-places.service';

describe('GooglePlacesService', () => {
  let service: GooglePlacesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GooglePlacesService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'GOOGLE_MAPS_MOCK_MODE') return 'true';
              if (key === 'GOOGLE_MAPS_API_KEY') return '';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GooglePlacesService>(GooglePlacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should identify mock mode when no API key is provided', () => {
    expect(service.isUsingMock()).toBe(true);
  });

  it('should calculate field mask correctly for basic search', () => {
    const mask = service.buildFieldMask(['name', 'formattedAddress', 'latitude'], false);
    expect(mask).toContain('places.displayName');
    expect(mask).toContain('places.formattedAddress');
    expect(mask).toContain('places.location');
  });

  it('should calculate estimated cost correctly for a 50 target job', () => {
    const estimate = service.estimateJobCost(50, ['name', 'phone', 'website']);
    expect(estimate.estimatedRequests).toBeGreaterThan(0);
    expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
    expect(estimate.hasDetailsCalls).toBe(true);
  });

  it('should return mock search places in mock mode without network calls', async () => {
    const result = await service.searchPlacesText({
      textQuery: 'dentist in Lucknow',
      maxResultCount: 5,
    });

    expect(result.isMock).toBe(true);
    expect(result.places.length).toBeGreaterThan(0);
    expect(result.places[0]).toHaveProperty('id');
    expect(result.places[0]).toHaveProperty('displayName');
  });
});
