import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodAdmin } from '../src/core/admin/admin.model.js';

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');
}

const zoneSeeds = [
  {
    name: 'Vijay Nagar',
    zoneName: 'Vijay Nagar',
    serviceLocation: 'Indore - Vijay Nagar',
    coordinates: [
      { latitude: 22.7534, longitude: 75.8937 },
      { latitude: 22.7575, longitude: 75.9018 },
      { latitude: 22.7488, longitude: 75.9077 },
      { latitude: 22.7441, longitude: 75.8976 }
    ]
  },
  {
    name: 'Palasia',
    zoneName: 'Palasia',
    serviceLocation: 'Indore - Palasia',
    coordinates: [
      { latitude: 22.7197, longitude: 75.8824 },
      { latitude: 22.7236, longitude: 75.8892 },
      { latitude: 22.7166, longitude: 75.8941 },
      { latitude: 22.7122, longitude: 75.8860 }
    ]
  },
  {
    name: 'Rau',
    zoneName: 'Rau',
    serviceLocation: 'Indore - Rau',
    coordinates: [
      { latitude: 22.6410, longitude: 75.8054 },
      { latitude: 22.6468, longitude: 75.8148 },
      { latitude: 22.6385, longitude: 75.8215 },
      { latitude: 22.6321, longitude: 75.8103 }
    ]
  }
];

const restaurantSeeds = [
  {
    restaurantName: 'Poha Junction',
    ownerName: 'Rohit Sharma',
    ownerEmail: 'rohit@pohajunction.in',
    ownerPhone: '9171110001',
    primaryContactNumber: '9171110001',
    area: 'Vijay Nagar',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452010',
    cuisines: ['Breakfast', 'Indori', 'Street Food'],
    pureVegRestaurant: true,
    openingTime: '07:00',
    closingTime: '22:30',
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    location: {
      type: 'Point',
      coordinates: [75.8994, 22.7512],
      latitude: 22.7512,
      longitude: 75.8994,
      addressLine1: 'Scheme 54',
      area: 'Vijay Nagar',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452010',
      formattedAddress: 'Scheme 54, Vijay Nagar, Indore'
    },
    estimatedDeliveryTime: '25 mins',
    rating: 4.5,
    featuredDish: 'Indori Poha',
    featuredPrice: 60,
    offer: '20% off up to Rs 80',
    zoneName: 'Vijay Nagar'
  },
  {
    restaurantName: 'Sarafa Sweets & Snacks',
    ownerName: 'Anjali Jain',
    ownerEmail: 'anjali@sarafasnacks.in',
    ownerPhone: '9171110002',
    primaryContactNumber: '9171110002',
    area: 'Palasia',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452001',
    cuisines: ['Desserts', 'North Indian', 'Snacks'],
    pureVegRestaurant: true,
    openingTime: '10:00',
    closingTime: '23:59',
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    location: {
      type: 'Point',
      coordinates: [75.8875, 22.7188],
      latitude: 22.7188,
      longitude: 75.8875,
      addressLine1: 'New Palasia Main Road',
      area: 'Palasia',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
      formattedAddress: 'New Palasia, Indore'
    },
    estimatedDeliveryTime: '30 mins',
    rating: 4.6,
    featuredDish: 'Malpua Rabdi',
    featuredPrice: 140,
    offer: 'Free sweet on orders above Rs 299',
    zoneName: 'Palasia'
  },
  {
    restaurantName: 'Chatori Galli',
    ownerName: 'Kunal Verma',
    ownerEmail: 'kunal@chatorigalli.in',
    ownerPhone: '9171110003',
    primaryContactNumber: '9171110003',
    area: 'Vijay Nagar',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452010',
    cuisines: ['Fast Food', 'Chinese', 'Rolls'],
    pureVegRestaurant: false,
    openingTime: '11:00',
    closingTime: '23:00',
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    location: {
      type: 'Point',
      coordinates: [75.9041, 22.7482],
      latitude: 22.7482,
      longitude: 75.9041,
      addressLine1: 'Near C21 Mall',
      area: 'Vijay Nagar',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452010',
      formattedAddress: 'Near C21 Mall, Vijay Nagar, Indore'
    },
    estimatedDeliveryTime: '35 mins',
    rating: 4.2,
    featuredDish: 'Paneer Tikka Roll',
    featuredPrice: 180,
    offer: 'Buy 1 Get 1 on rolls',
    zoneName: 'Vijay Nagar'
  },
  {
    restaurantName: 'Narmada Family Dhaba',
    ownerName: 'Suresh Patel',
    ownerEmail: 'suresh@narmadadhaba.in',
    ownerPhone: '9171110004',
    primaryContactNumber: '9171110004',
    area: 'Rau',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '453331',
    cuisines: ['North Indian', 'Thali', 'Tandoor'],
    pureVegRestaurant: false,
    openingTime: '12:00',
    closingTime: '23:30',
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    location: {
      type: 'Point',
      coordinates: [75.8126, 22.6391],
      latitude: 22.6391,
      longitude: 75.8126,
      addressLine1: 'AB Road Rau',
      area: 'Rau',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '453331',
      formattedAddress: 'AB Road, Rau, Indore'
    },
    estimatedDeliveryTime: '40 mins',
    rating: 4.1,
    featuredDish: 'Butter Chicken',
    featuredPrice: 320,
    offer: '15% off on family combos',
    zoneName: 'Rau'
  },
  {
    restaurantName: '56 Dukan Bites',
    ownerName: 'Megha Agrawal',
    ownerEmail: 'megha@56dukanbites.in',
    ownerPhone: '9171110005',
    primaryContactNumber: '9171110005',
    area: 'Palasia',
    city: 'Indore',
    state: 'Madhya Pradesh',
    pincode: '452001',
    cuisines: ['Street Food', 'Beverages', 'Chaat'],
    pureVegRestaurant: true,
    openingTime: '09:00',
    closingTime: '23:00',
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    location: {
      type: 'Point',
      coordinates: [75.8843, 22.7252],
      latitude: 22.7252,
      longitude: 75.8843,
      addressLine1: '56 Dukan',
      area: 'Palasia',
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
      formattedAddress: '56 Dukan, Indore'
    },
    estimatedDeliveryTime: '20 mins',
    rating: 4.7,
    featuredDish: 'Dahi Puri',
    featuredPrice: 90,
    offer: 'Flat Rs 75 off above Rs 399',
    zoneName: 'Palasia'
  }
];

const adminSeed = {
  email: 'admin@suvio.appzeto.com',
  password: 'Admin@12345',
  name: 'Suvio Super Admin',
  phone: '9171119999'
};

async function upsertZones() {
  const zoneMap = new Map();

  for (const seed of zoneSeeds) {
    const zone = await FoodZone.findOneAndUpdate(
      { name: seed.name, country: 'India' },
      {
        $set: {
          zoneName: seed.zoneName,
          serviceLocation: seed.serviceLocation,
          unit: 'kilometer',
          coordinates: seed.coordinates,
          isActive: true,
          country: 'India'
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    zoneMap.set(seed.name, zone);
  }

  return zoneMap;
}

async function upsertRestaurants(zoneMap) {
  const restaurants = [];

  for (const seed of restaurantSeeds) {
    const zone = zoneMap.get(seed.zoneName);
    const update = {
      ...seed,
      zoneId: zone?._id,
      status: 'approved',
      approvedAt: new Date(),
      onboardingFeePaid: true,
      onboardingFeeAmount: 999,
      onboardingFeePaidAt: new Date(),
      businessModel: 'commission',
      isAcceptingOrders: true,
      subscriptionPlan: 'starter',
      subscriptionAmount: 1499,
      subscriptionPaidAmount: 1499,
      subscriptionDueAmount: 0,
      subscriptionStatus: 'paid',
      subscriptionValidTill: new Date('2027-07-24T00:00:00.000Z')
    };

    delete update.zoneName;

    const restaurant = await FoodRestaurant.findOneAndUpdate(
      { restaurantName: seed.restaurantName, ownerPhone: seed.ownerPhone },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    restaurants.push(restaurant);
  }

  return restaurants;
}

async function upsertAdmin() {
  let admin = await FoodAdmin.findOne({ email: adminSeed.email });

  if (!admin) {
    admin = new FoodAdmin({
      ...adminSeed,
      role: 'ADMIN',
      adminType: 'super_admin',
      isActive: true,
      isDeleted: false,
      servicesAccess: ['food']
    });
  } else {
    admin.name = adminSeed.name;
    admin.phone = adminSeed.phone;
    admin.password = adminSeed.password;
    admin.adminType = 'super_admin';
    admin.role = 'ADMIN';
    admin.isActive = true;
    admin.isDeleted = false;
    admin.servicesAccess = ['food'];
  }

  await admin.save();
  return admin;
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const zoneMap = await upsertZones();
  const restaurants = await upsertRestaurants(zoneMap);
  const admin = await upsertAdmin();

  console.log('\nSeed complete.');
  console.log(`Zones: ${zoneMap.size}`);
  console.log(`Restaurants: ${restaurants.length}`);
  console.log(`Admin: ${admin.email}`);
  console.log(`Admin password: ${adminSeed.password}`);

  console.log('\nZone IDs:');
  for (const [name, zone] of zoneMap.entries()) {
    console.log(`- ${name}: ${zone._id}`);
  }

  console.log('\nRestaurants:');
  for (const restaurant of restaurants) {
    console.log(`- ${restaurant.restaurantName} | ${restaurant.city} | ${restaurant.status}`);
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
