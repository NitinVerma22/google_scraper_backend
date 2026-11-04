import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CityBoundary, isPointInPolygon } from '../city-discovery/city-discovery-planner.service';

export interface GeneratedCell {
  cellIndex: number;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  localityName?: string;
}

@Injectable()
export class GeoGridService {
  private readonly logger = new Logger(GeoGridService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate an adaptive grid of search coordinates across the city's bounding box
   * Discards points falling outside the official city boundary polygon
   */
  generateCityGrid(boundary: CityBoundary, cellRadiusMeters = 2000): GeneratedCell[] {
    const rawCells: GeneratedCell[] = [];
    
    // 1 degree latitude ~ 111,000 meters
    const latDegreeStep = (cellRadiusMeters * 1.5) / 111000;
    
    // 1 degree longitude ~ 111,000 * cos(latitude)
    const avgLat = (boundary.northLat + boundary.southLat) / 2;
    const lngDegreeStep = (cellRadiusMeters * 1.5) / (111000 * Math.cos(avgLat * (Math.PI / 180)));

    let cellIndex = 1;
    let discardedCount = 0;

    // Traverse bounding box from North to South, West to East
    for (let lat = boundary.northLat; lat >= boundary.southLat; lat -= latDegreeStep) {
      for (let lng = boundary.westLng; lng <= boundary.eastLng; lng += lngDegreeStep) {
        const point = { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };

        // Point-in-polygon clipping: discard points outside municipal limits
        if (boundary.boundaryPolygon && boundary.boundaryPolygon.length >= 3) {
          const isInside = isPointInPolygon(point, boundary.boundaryPolygon);
          if (!isInside) {
            discardedCount++;
            continue; // Discard point outside city polygon
          }
        }

        rawCells.push({
          cellIndex: cellIndex++,
          centerLat: point.lat,
          centerLng: point.lng,
          radiusMeters: cellRadiusMeters,
        });
      }
    }

    this.logger.log(`City Polygon Filter: Retained ${rawCells.length} valid coordinates inside ${boundary.cityName} (pruned ${discardedCount} points outside boundary)`);
    return rawCells;
  }

  /**
   * Persist generated cells into MySQL database for a collection job
   */
  async persistJobCells(jobId: string, cells: GeneratedCell[]): Promise<void> {
    const data = cells.map((cell) => ({
      jobId,
      cellIndex: cell.cellIndex,
      centerLat: cell.centerLat,
      centerLng: cell.centerLng,
      radiusMeters: cell.radiusMeters,
      localityName: cell.localityName || `Cell #${cell.cellIndex}`,
      status: 'PENDING',
      isInsidePolygon: true,
    }));

    // Batch insert cells
    await this.prisma.geoCell.createMany({
      data,
    });

    this.logger.log(`Persisted ${data.length} geo cells in database for job: ${jobId}`);
  }

  /**
   * Subdivide an under-explored cell into 4 high-density quadrant sub-cells
   */
  async subdivideCell(cellId: string): Promise<GeneratedCell[]> {
    const cell = await this.prisma.geoCell.findUnique({ where: { id: cellId } });
    if (!cell) throw new Error(`Cell ${cellId} not found`);

    const offset = (cell.radiusMeters / 2) / 111000;
    const newRadius = Math.round(cell.radiusMeters * 0.6);

    const subCells: GeneratedCell[] = [
      {
        cellIndex: cell.cellIndex * 10 + 1,
        centerLat: Number((cell.centerLat + offset).toFixed(4)),
        centerLng: Number((cell.centerLng + offset).toFixed(4)),
        radiusMeters: newRadius,
        localityName: `${cell.localityName || 'Cell'} - NE Quadrant`,
      },
      {
        cellIndex: cell.cellIndex * 10 + 2,
        centerLat: Number((cell.centerLat + offset).toFixed(4)),
        centerLng: Number((cell.centerLng - offset).toFixed(4)),
        radiusMeters: newRadius,
        localityName: `${cell.localityName || 'Cell'} - NW Quadrant`,
      },
      {
        cellIndex: cell.cellIndex * 10 + 3,
        centerLat: Number((cell.centerLat - offset).toFixed(4)),
        centerLng: Number((cell.centerLng + offset).toFixed(4)),
        radiusMeters: newRadius,
        localityName: `${cell.localityName || 'Cell'} - SE Quadrant`,
      },
      {
        cellIndex: cell.cellIndex * 10 + 4,
        centerLat: Number((cell.centerLat - offset).toFixed(4)),
        centerLng: Number((cell.centerLng - offset).toFixed(4)),
        radiusMeters: newRadius,
        localityName: `${cell.localityName || 'Cell'} - SW Quadrant`,
      },
    ];

    // Mark parent cell as UNDER_EXPLORED
    await this.prisma.geoCell.update({
      where: { id: cellId },
      data: { status: 'UNDER_EXPLORED' },
    });

    // Create subcells in DB
    await this.prisma.geoCell.createMany({
      data: subCells.map((sc) => ({
        jobId: cell.jobId,
        cellIndex: sc.cellIndex,
        centerLat: sc.centerLat,
        centerLng: sc.centerLng,
        radiusMeters: sc.radiusMeters,
        localityName: sc.localityName,
        status: 'PENDING',
        isInsidePolygon: true,
      })),
    });

    return subCells;
  }
}
