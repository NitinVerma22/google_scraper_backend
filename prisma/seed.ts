import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding LeadGen database...');

  // 1. Create Admin & Operator Users
  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 10);
  const operatorPasswordHash = await bcrypt.hash('OperatorPassword123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@leadgen.com' },
    update: {},
    create: {
      email: 'admin@leadgen.com',
      name: 'Executive Administrator',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: 'operator@leadgen.com' },
    update: {},
    create: {
      email: 'operator@leadgen.com',
      name: 'Operations Lead',
      passwordHash: operatorPasswordHash,
      role: Role.OPERATOR,
    },
  });

  console.log('Created users:', { admin: admin.email, operator: operator.email });

  // 2. Seed Initial High-Quality Business Records
  const seedBusinesses = [
    {
      placeId: 'ChIJ53em7U5NlzsRhfM1-B5x4Yk',
      name: 'Apex Real Estate Consultants',
      primaryType: 'real_estate_agency',
      types: ['real_estate_agency', 'point_of_interest', 'establishment'],
      formattedAddress: '14/2 Gomti Nagar Extension, Lucknow, Uttar Pradesh 226010, India',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '226010',
      latitude: 26.8521,
      longitude: 80.9924,
      googleMapsUrl: 'https://maps.google.com/?cid=1001',
      phone: '+91 522 4001234',
      internationalPhone: '+91 522 400 1234',
      website: 'https://apexrealestate.example.com',
      rating: 4.8,
      userRatingCount: 142,
      businessStatus: 'OPERATIONAL',
      priceLevel: 'PRICE_LEVEL_EXPENSIVE',
    },
    {
      placeId: 'ChIJ72fK56VNlzsRG2Ld8K_18z8',
      name: 'Care Dental & Implant Super-Speciality Clinic',
      primaryType: 'dentist',
      types: ['dentist', 'health', 'point_of_interest'],
      formattedAddress: '88 Hazratganj Mall Avenue, Lucknow, Uttar Pradesh 226001, India',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '226001',
      latitude: 26.8485,
      longitude: 80.9472,
      googleMapsUrl: 'https://maps.google.com/?cid=1002',
      phone: '+91 522 2289900',
      internationalPhone: '+91 522 228 9900',
      website: 'https://caredental.example.com',
      rating: 4.9,
      userRatingCount: 284,
      businessStatus: 'OPERATIONAL',
      priceLevel: 'PRICE_LEVEL_MODERATE',
    },
    {
      placeId: 'ChIJw1rQ495NlzsRJw_z6P_81a1',
      name: 'Urban Fitness Studio & Crossfit Gym',
      primaryType: 'gym',
      types: ['gym', 'health', 'point_of_interest'],
      formattedAddress: 'Plot 45, Sector B, Aliganj Main Road, Lucknow, Uttar Pradesh 226024, India',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '226024',
      latitude: 26.8841,
      longitude: 80.9426,
      googleMapsUrl: 'https://maps.google.com/?cid=1003',
      phone: '+91 98390 11223',
      internationalPhone: '+91 98390 11223',
      website: null, // intentionally null for filter testing (Has Website = No)
      rating: 4.4,
      userRatingCount: 78,
      businessStatus: 'OPERATIONAL',
      priceLevel: 'PRICE_LEVEL_MODERATE',
    },
    {
      placeId: 'ChIJz88Q3xVNlzsRM9X12A_77y2',
      name: 'The Royal Heritage Bistro & Rooftop Cafe',
      primaryType: 'restaurant',
      types: ['restaurant', 'cafe', 'food', 'point_of_interest'],
      formattedAddress: '12 Rana Pratap Marg, Hazratganj, Lucknow, Uttar Pradesh 226001, India',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '226001',
      latitude: 26.8512,
      longitude: 80.9528,
      googleMapsUrl: 'https://maps.google.com/?cid=1004',
      phone: '+91 522 2617788',
      internationalPhone: '+91 522 261 7788',
      website: 'https://royalheritagebistro.example.com',
      rating: 4.7,
      userRatingCount: 650,
      businessStatus: 'OPERATIONAL',
      priceLevel: 'PRICE_LEVEL_EXPENSIVE',
    },
    {
      placeId: 'ChIJt66e21RNlzsRL0K98N_33w4',
      name: 'City Health Multi-Speciality Clinic & Pharmacy',
      primaryType: 'medical_clinic',
      types: ['medical_clinic', 'pharmacy', 'health'],
      formattedAddress: 'Sector B, Mahanagar, Lucknow, Uttar Pradesh 226006, India',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '226006',
      latitude: 26.8774,
      longitude: 80.9542,
      googleMapsUrl: 'https://maps.google.com/?cid=1005',
      phone: '+91 522 2334455',
      internationalPhone: '+91 522 233 4455',
      website: null,
      rating: 4.5,
      userRatingCount: 112,
      businessStatus: 'OPERATIONAL',
    },
    {
      placeId: 'ChIJk12A90BNlzsRQ4P87T_22u9',
      name: 'Horizon Tech & Business Consulting Hub',
      primaryType: 'corporate_office',
      types: ['point_of_interest', 'establishment'],
      formattedAddress: 'Cyber Heights 7th Floor, Vibhuti Khand, Lucknow, Uttar Pradesh 226010, India',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '226010',
      latitude: 26.8643,
      longitude: 81.0021,
      googleMapsUrl: 'https://maps.google.com/?cid=1006',
      phone: null, // intentionally null for filter testing (Has Phone = No)
      internationalPhone: null,
      website: 'https://horizontech.example.com',
      rating: 4.2,
      userRatingCount: 34,
      businessStatus: 'OPERATIONAL',
    },
  ];

  const createdRecords = [];
  for (const b of seedBusinesses) {
    const record = await prisma.businessRecord.upsert({
      where: { placeId: b.placeId },
      update: {},
      create: b,
    });
    createdRecords.push(record);
  }

  // 3. Create a Completed Sample Collection Job
  const sampleJob = await prisma.collectionJob.create({
    data: {
      userId: admin.id,
      name: 'Lucknow Real Estate & Clinics Initial Lead Run',
      status: 'COMPLETED',
      locationConfig: {
        country: 'India',
        state: 'Uttar Pradesh',
        city: 'Lucknow',
        locality: 'Gomti Nagar',
      },
      categoryConfig: {
        primaryCategory: 'real_estate_agency',
        categories: ['real_estate_agency', 'dentist', 'gym'],
        customKeywords: ['property dealers', 'dental clinics'],
      },
      targetCount: 50,
      selectedFields: ['name', 'phone', 'website', 'rating', 'userRatingCount', 'formattedAddress'],
      discoveredCount: 6,
      processedCount: 6,
      matchedCount: 6,
      failedCount: 0,
      requestCount: 7,
      estimatedCost: 0.124,
      isMockMode: true,
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3400000),
    },
  });

  // Link job results
  for (const rec of createdRecords) {
    await prisma.jobResult.upsert({
      where: {
        jobId_businessRecordId: {
          jobId: sampleJob.id,
          businessRecordId: rec.id,
        },
      },
      update: {},
      create: {
        jobId: sampleJob.id,
        businessRecordId: rec.id,
        filterStatus: 'MATCHED',
        processingStatus: 'COMPLETED',
      },
    });
  }

  // Add sample API usage log
  await prisma.apiUsageLog.createMany({
    data: [
      {
        jobId: sampleJob.id,
        endpoint: 'geocode',
        requestCount: 1,
        statusCode: 200,
        durationMs: 142,
        estimatedCost: 0.005,
      },
      {
        jobId: sampleJob.id,
        endpoint: 'places:searchText',
        requestCount: 3,
        statusCode: 200,
        durationMs: 512,
        estimatedCost: 0.105,
      },
      {
        jobId: sampleJob.id,
        endpoint: 'places:details',
        requestCount: 3,
        statusCode: 200,
        durationMs: 380,
        estimatedCost: 0.014,
      },
    ],
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
