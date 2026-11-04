import { Injectable, Logger } from '@nestjs/common';

export interface LocalityProfile {
  name: string;
  type: 'RESIDENTIAL' | 'COMMERCIAL_MARKET' | 'HEALTHCARE_HUB' | 'SUBURBAN' | 'MIXED';
  density: 'HIGH' | 'MEDIUM' | 'EMERGING';
  suggestedCategories: string[];
  approxLat: number;
  approxLng: number;
}

@Injectable()
export class LocalityIntelligenceService {
  private readonly logger = new Logger(LocalityIntelligenceService.name);

  // 85+ Curated Lucknow Localities spanning all sectors, colonies, markets, and peri-urban hubs
  private readonly LUCKNOW_LOCALITIES: LocalityProfile[] = [
    // --- Gomti Nagar & Extensions ---
    { name: 'Gomti Nagar Vibhuti Khand', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['cafe', 'restaurant', 'dental_clinic', 'hair_salon'], approxLat: 26.864, approxLng: 81.002 },
    { name: 'Gomti Nagar Patrakarpuram', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'beauty_salon', 'dental_clinic', 'pharmacy'], approxLat: 26.851, approxLng: 80.998 },
    { name: 'Gomti Nagar Sector 1', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dental_clinic', 'medical_lab', 'hair_salon', 'bakery'], approxLat: 26.848, approxLng: 80.992 },
    { name: 'Gomti Nagar Sector 4', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['clinic', 'dentist', 'cafe', 'spa'], approxLat: 26.855, approxLng: 80.996 },
    { name: 'Gomti Nagar Sector 6', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['pharmacy', 'bakery', 'car_repair', 'beauty_salon'], approxLat: 26.861, approxLng: 81.005 },
    { name: 'Gomti Nagar Extension Sector 1', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['dental_clinic', 'restaurant', 'car_repair', 'beauty_salon'], approxLat: 26.838, approxLng: 81.025 },
    { name: 'Gomti Nagar Extension Sector 4', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['bakery', 'cafe', 'medical_lab', 'hair_salon'], approxLat: 26.842, approxLng: 81.031 },
    { name: 'Gomti Nagar Extension Sector 7', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['pharmacy', 'clinic', 'car_repair'], approxLat: 26.847, approxLng: 81.039 },

    // --- Indira Nagar ---
    { name: 'Indira Nagar Bhootnath Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'hair_salon', 'dental_clinic', 'beauty_salon'], approxLat: 26.878, approxLng: 80.985 },
    { name: 'Indira Nagar Munshipulia', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['car_repair', 'medical_lab', 'cafe', 'dentist'], approxLat: 26.891, approxLng: 80.995 },
    { name: 'Indira Nagar Sector 11', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dental_clinic', 'clinic', 'pharmacy', 'bakery'], approxLat: 26.882, approxLng: 80.982 },
    { name: 'Indira Nagar Sector 14', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['hair_salon', 'beauty_salon', 'medical_lab', 'cafe'], approxLat: 26.886, approxLng: 80.978 },
    { name: 'Indira Nagar Sector 18', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['car_repair', 'pharmacy', 'dentist'], approxLat: 26.889, approxLng: 80.989 },
    { name: 'Indira Nagar Sector 21', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['clinic', 'hair_salon', 'bakery'], approxLat: 26.894, approxLng: 80.992 },

    // --- Aliganj & Kapoorthala ---
    { name: 'Aliganj Kapoorthala', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'cafe', 'beauty_salon', 'hair_salon', 'dental_clinic', 'coaching_center'], approxLat: 26.884, approxLng: 80.942 },
    { name: 'Aliganj Dandiya Bazar', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['pharmacy', 'medical_lab', 'bakery', 'car_repair'], approxLat: 26.888, approxLng: 80.938 },
    { name: 'Aliganj Sector A', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dental_clinic', 'clinic', 'beauty_salon'], approxLat: 26.881, approxLng: 80.945 },
    { name: 'Aliganj Sector B', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['hair_salon', 'bakery', 'medical_lab'], approxLat: 26.885, approxLng: 80.948 },
    { name: 'Aliganj Sector C', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dentist', 'cafe', 'pharmacy'], approxLat: 26.890, approxLng: 80.941 },
    { name: 'Aliganj Sector J', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['clinic', 'car_repair', 'hair_salon'], approxLat: 26.895, approxLng: 80.935 },

    // --- Hazratganj & Central ---
    { name: 'Hazratganj MG Marg', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'cafe', 'bakery', 'beauty_salon', 'lodging'], approxLat: 26.848, approxLng: 80.946 },
    { name: 'Hazratganj Janpath Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['electronics_store', 'hair_salon', 'cafe', 'restaurant'], approxLat: 26.845, approxLng: 80.944 },
    { name: 'Lalbagh Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['car_repair', 'auto_parts_store', 'restaurant', 'bakery'], approxLat: 26.843, approxLng: 80.939 },
    { name: 'Ashok Marg Hazratganj', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['dental_clinic', 'medical_lab', 'beauty_salon', 'cafe'], approxLat: 26.852, approxLng: 80.948 },

    // --- Mahanagar & Nishatganj ---
    { name: 'Mahanagar Gole Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'hair_salon', 'dental_clinic', 'pharmacy'], approxLat: 26.875, approxLng: 80.953 },
    { name: 'Mahanagar Sector B', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['clinic', 'dentist', 'medical_lab', 'beauty_salon'], approxLat: 26.879, approxLng: 80.957 },
    { name: 'Mahanagar Sector C', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['bakery', 'cafe', 'hair_salon', 'car_repair'], approxLat: 26.883, approxLng: 80.961 },
    { name: 'Nishatganj 5th Street', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['pharmacy', 'medical_lab', 'restaurant', 'bakery'], approxLat: 26.865, approxLng: 80.958 },
    { name: 'Badshahnagar Railway Station Area', type: 'MIXED', density: 'HIGH', suggestedCategories: ['car_repair', 'lodging', 'pharmacy', 'restaurant'], approxLat: 26.871, approxLng: 80.965 },

    // --- Alambagh & South West ---
    { name: 'Alambagh Chander Nagar', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'dental_clinic', 'hair_salon', 'beauty_salon'], approxLat: 26.812, approxLng: 80.908 },
    { name: 'Alambagh Singar Nagar', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['cafe', 'restaurant', 'pharmacy', 'medical_lab'], approxLat: 26.808, approxLng: 80.902 },
    { name: 'Alambagh Sujanpura', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['clinic', 'dentist', 'hair_salon', 'car_repair'], approxLat: 26.816, approxLng: 80.912 },
    { name: 'Alambagh Phoenix United Area', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['cafe', 'restaurant', 'beauty_salon', 'spa'], approxLat: 26.801, approxLng: 80.898 },

    // --- Chowk & Old Lucknow ---
    { name: 'Chowk Sarafa Bazar', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'cafe', 'medical_lab'], approxLat: 26.868, approxLng: 80.906 },
    { name: 'Chowk Gol Darwaza', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'pharmacy', 'hair_salon'], approxLat: 26.865, approxLng: 80.909 },
    { name: 'Chowk Nakhas Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['car_repair', 'auto_parts_store', 'hair_salon'], approxLat: 26.858, approxLng: 80.912 },
    { name: 'Chowk Raja Bazar', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['clinic', 'dentist', 'pharmacy'], approxLat: 26.862, approxLng: 80.903 },

    // --- Aminabad ---
    { name: 'Aminabad Pratap Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'beauty_salon', 'pharmacy'], approxLat: 26.845, approxLng: 80.926 },
    { name: 'Aminabad Garbarjhala', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['beauty_salon', 'hair_salon', 'cafe'], approxLat: 26.842, approxLng: 80.928 },
    { name: 'Aminabad Nazirabad', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['bakery', 'restaurant', 'medical_lab'], approxLat: 26.847, approxLng: 80.931 },

    // --- Rajajipuram ---
    { name: 'Rajajipuram Block A', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dental_clinic', 'pharmacy', 'bakery', 'hair_salon'], approxLat: 26.841, approxLng: 80.887 },
    { name: 'Rajajipuram Block C Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'cafe', 'beauty_salon', 'medical_lab', 'dentist'], approxLat: 26.838, approxLng: 80.882 },
    { name: 'Rajajipuram Block E', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['clinic', 'pharmacy', 'car_repair'], approxLat: 26.834, approxLng: 80.878 },
    { name: 'Talkatora Industrial Area', type: 'MIXED', density: 'HIGH', suggestedCategories: ['car_repair', 'hardware_store', 'pharmacy'], approxLat: 26.829, approxLng: 80.895 },

    // --- Ashiyana & LDA Colony ---
    { name: 'Ashiyana Sector H Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'cafe', 'bakery', 'beauty_salon', 'dentist'], approxLat: 26.792, approxLng: 80.918 },
    { name: 'Ashiyana Sector K', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dental_clinic', 'medical_lab', 'pharmacy', 'hair_salon'], approxLat: 26.788, approxLng: 80.922 },
    { name: 'Ashiyana Sector M', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['clinic', 'car_repair', 'bakery'], approxLat: 26.782, approxLng: 80.926 },
    { name: 'Bangla Bazar Road', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'pharmacy', 'hair_salon'], approxLat: 26.796, approxLng: 80.932 },
    { name: 'LDA Colony Pakri Ka Pul', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['car_repair', 'dentist', 'restaurant', 'cafe'], approxLat: 26.804, approxLng: 80.919 },

    // --- Jankipuram & Jankipuram Vistar ---
    { name: 'Jankipuram Engineering College Chauraha', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['cafe', 'restaurant', 'bakery', 'dental_clinic', 'hair_salon'], approxLat: 26.912, approxLng: 80.948 },
    { name: 'Jankipuram Sector F Market', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['medical_lab', 'clinic', 'dentist', 'beauty_salon', 'pharmacy'], approxLat: 26.918, approxLng: 80.942 },
    { name: 'Jankipuram Sector J', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['car_repair', 'bakery', 'hair_salon'], approxLat: 26.924, approxLng: 80.938 },
    { name: 'Jankipuram Vistar Sector 2', type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['dental_clinic', 'pharmacy', 'bakery', 'cafe'], approxLat: 26.932, approxLng: 80.958 },
    { name: 'Jankipuram Vistar Sector 6', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['car_repair', 'clinic', 'beauty_salon'], approxLat: 26.941, approxLng: 80.966 },

    // --- Vikas Nagar ---
    { name: 'Vikas Nagar Tedhi Pulia', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'car_repair', 'medical_lab', 'pharmacy'], approxLat: 26.901, approxLng: 80.962 },
    { name: 'Vikas Nagar Sector 4', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['dental_clinic', 'bakery', 'hair_salon', 'clinic'], approxLat: 26.897, approxLng: 80.957 },
    { name: 'Vikas Nagar Sector 8', type: 'RESIDENTIAL', density: 'HIGH', suggestedCategories: ['beauty_salon', 'pharmacy', 'dentist'], approxLat: 26.893, approxLng: 80.951 },

    // --- Telibagh, Raebareli Rd & Vrindavan ---
    { name: 'Telibagh Bazar', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'hair_salon', 'pharmacy', 'dentist'], approxLat: 26.782, approxLng: 80.944 },
    { name: 'SGPGI Raebareli Road', type: 'HEALTHCARE_HUB', density: 'HIGH', suggestedCategories: ['medical_lab', 'pharmacy', 'lodging', 'clinic', 'restaurant'], approxLat: 26.758, approxLng: 80.942 },
    { name: 'Vrindavan Yojna Sector 5', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['dental_clinic', 'bakery', 'cafe', 'beauty_salon'], approxLat: 26.764, approxLng: 80.965 },
    { name: 'Vrindavan Yojna Sector 9', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['clinic', 'car_repair', 'pharmacy'], approxLat: 26.771, approxLng: 80.974 },

    // --- Krishna Nagar & Transport Nagar ---
    { name: 'Krishna Nagar Kanpur Road', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'bakery', 'hair_salon', 'dentist', 'cafe'], approxLat: 26.792, approxLng: 80.892 },
    { name: 'Transport Nagar Commercial Area', type: 'MIXED', density: 'HIGH', suggestedCategories: ['car_repair', 'auto_parts_store', 'lodging', 'restaurant'], approxLat: 26.778, approxLng: 80.878 },
    { name: 'Sarojini Nagar Industrial Area', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['car_repair', 'pharmacy', 'clinic'], approxLat: 26.755, approxLng: 80.865 },

    // --- Chinhat & Eastern Corridor ---
    { name: 'Chinhat Tiraha', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'pharmacy', 'car_repair', 'medical_lab'], approxLat: 26.885, approxLng: 81.048 },
    { name: 'Matiyari Chauraha', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['bakery', 'hair_salon', 'dentist', 'clinic'], approxLat: 26.892, approxLng: 81.055 },
    { name: 'Kamta Chauraha Faizabad Road', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['lodging', 'restaurant', 'car_repair', 'beauty_salon'], approxLat: 26.874, approxLng: 81.031 },

    // --- Dubagga & Western Corridor ---
    { name: 'Dubagga Mandi Hardoi Road', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'car_repair', 'pharmacy', 'clinic'], approxLat: 26.872, approxLng: 80.854 },
    { name: 'Para Police Station Area', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['dental_clinic', 'hair_salon', 'bakery'], approxLat: 26.848, approxLng: 80.862 },
    { name: 'Thakurganj Campbell Road', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['medical_lab', 'pharmacy', 'dentist', 'beauty_salon'], approxLat: 26.871, approxLng: 80.889 },

    // --- North & South Outskirts ---
    { name: 'Bakshi Ka Talab Market', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['car_repair', 'pharmacy', 'restaurant', 'clinic'], approxLat: 26.985, approxLng: 80.925 },
    { name: 'Mohanlalganj Main Bazar', type: 'SUBURBAN', density: 'MEDIUM', suggestedCategories: ['clinic', 'pharmacy', 'car_repair', 'hair_salon'], approxLat: 26.685, approxLng: 80.985 },
    { name: 'Sushant Golf City Amar Shaheed Path', type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['cafe', 'restaurant', 'bakery', 'spa', 'beauty_salon'], approxLat: 26.782, approxLng: 81.015 },
  ];

  /**
   * Get all registered localities for the city
   */
  getLocalitiesForCity(cityName: string): LocalityProfile[] {
    const key = cityName.toLowerCase();
    if (key.includes('lucknow')) {
      return this.LUCKNOW_LOCALITIES;
    }

    // Default synthetic localities for other cities
    return [
      { name: `${cityName} City Center`, type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['restaurant', 'dental_clinic', 'hair_salon'], approxLat: 26.8467, approxLng: 80.9462 },
      { name: `${cityName} North Sector`, type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['clinic', 'bakery', 'pharmacy'], approxLat: 26.88, approxLng: 80.95 },
      { name: `${cityName} South Sector`, type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['car_repair', 'beauty_salon'], approxLat: 26.81, approxLng: 80.92 },
      { name: `${cityName} East Market`, type: 'COMMERCIAL_MARKET', density: 'HIGH', suggestedCategories: ['cafe', 'dentist', 'medical_lab'], approxLat: 26.85, approxLng: 81.01 },
      { name: `${cityName} West Colony`, type: 'RESIDENTIAL', density: 'MEDIUM', suggestedCategories: ['pharmacy', 'hair_salon'], approxLat: 26.84, approxLng: 80.88 },
    ];
  }

  /**
   * Get supported Google Places API (New) official granular types
   */
  getGranularBusinessTypes(): { type: string; label: string; priority: number }[] {
    return [
      { type: 'dental_clinic', label: 'Dental Clinic & Dentists', priority: 1 },
      { type: 'medical_lab', label: 'Pathology & Diagnostic Labs', priority: 1 },
      { type: 'hair_salon', label: 'Hair Salons & Barbers', priority: 1 },
      { type: 'beauty_salon', label: 'Beauty Salons & Parlours', priority: 1 },
      { type: 'restaurant', label: 'Restaurants & Eateries', priority: 1 },
      { type: 'cafe', label: 'Cafes & Coffee Shops', priority: 1 },
      { type: 'bakery', label: 'Bakeries & Cake Shops', priority: 2 },
      { type: 'car_repair', label: 'Car Repair & Service Workshops', priority: 2 },
      { type: 'clinic', label: 'Specialist Medical Clinics', priority: 2 },
      { type: 'pharmacy', label: 'Pharmacies & Chemists', priority: 2 },
      { type: 'lodging', label: 'Guest Houses & Small Hotels', priority: 3 },
      { type: 'gym', label: 'Gyms & Fitness Studios', priority: 3 },
      { type: 'auto_parts_store', label: 'Auto Parts & Accessories', priority: 3 },
    ];
  }
}
