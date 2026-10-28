import { Injectable } from '@nestjs/common';
import { GooglePlacesService } from '../google-places/google-places.service';

export interface LocationHierarchyNode {
  name: string;
  code?: string;
  states?: {
    name: string;
    cities: string[];
  }[];
}

@Injectable()
export class LocationsService {
  constructor(private readonly googlePlaces: GooglePlacesService) {}

  // Built-in curated geographic hierarchy for seamless cascading dropdowns
  private readonly hierarchy: LocationHierarchyNode[] = [
    {
      name: 'India',
      code: 'IN',
      states: [
        {
          name: 'Uttar Pradesh',
          cities: ['Lucknow', 'Kanpur', 'Varanasi', 'Noida', 'Agra', 'Prayagraj', 'Ghaziabad', 'Bareilly'],
        },
        {
          name: 'Maharashtra',
          cities: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad'],
        },
        {
          name: 'Karnataka',
          cities: ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi'],
        },
        {
          name: 'Delhi NCR',
          cities: ['New Delhi', 'South Delhi', 'North Delhi', 'Gurugram', 'Faridabad'],
        },
        {
          name: 'Tamil Nadu',
          cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
        },
        {
          name: 'Gujarat',
          cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Gandhinagar'],
        },
        {
          name: 'Telangana',
          cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar'],
        },
        {
          name: 'Rajasthan',
          cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner'],
        },
      ],
    },
    {
      name: 'United States',
      code: 'US',
      states: [
        {
          name: 'California',
          cities: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento'],
        },
        {
          name: 'New York',
          cities: ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse'],
        },
        {
          name: 'Texas',
          cities: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Fort Worth'],
        },
        {
          name: 'Florida',
          cities: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Fort Lauderdale'],
        },
        {
          name: 'Illinois',
          cities: ['Chicago', 'Aurora', 'Naperville', 'Rockford', 'Joliet'],
        },
      ],
    },
    {
      name: 'United Kingdom',
      code: 'GB',
      states: [
        {
          name: 'England',
          cities: ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol'],
        },
        {
          name: 'Scotland',
          cities: ['Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee'],
        },
      ],
    },
    {
      name: 'United Arab Emirates',
      code: 'AE',
      states: [
        {
          name: 'Emirates',
          cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah'],
        },
      ],
    },
    {
      name: 'Canada',
      code: 'CA',
      states: [
        {
          name: 'Ontario',
          cities: ['Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton'],
        },
        {
          name: 'British Columbia',
          cities: ['Vancouver', 'Victoria', 'Surrey', 'Burnaby', 'Richmond'],
        },
      ],
    },
    {
      name: 'Australia',
      code: 'AU',
      states: [
        {
          name: 'New South Wales',
          cities: ['Sydney', 'Newcastle', 'Wollongong', 'Central Coast'],
        },
        {
          name: 'Victoria',
          cities: ['Melbourne', 'Geelong', 'Ballarat', 'Bendigo'],
        },
      ],
    },
  ];

  getHierarchy() {
    return this.hierarchy;
  }

  getCountries() {
    return this.hierarchy.map((c) => ({ name: c.name, code: c.code }));
  }

  getStates(countryName: string) {
    const country = this.hierarchy.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
    return country ? country.states?.map((s) => s.name) || [] : [];
  }

  getCities(countryName: string, stateName: string) {
    const country = this.hierarchy.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
    if (!country || !country.states) return [];
    const state = country.states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
    return state ? state.cities : [];
  }

  async geocode(address: string) {
    return this.googlePlaces.geocode(address);
  }
}
