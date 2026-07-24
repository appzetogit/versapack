import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodCategory } from '../src/modules/food/admin/models/category.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodHeroBanner } from '../src/modules/food/landing/models/heroBanner.model.js';
import TopBanner from '../src/modules/food/landing/models/topBanner.model.js';
import { FoodUnder250Banner } from '../src/modules/food/landing/models/under250Banner.model.js';
import { FoodDiningBanner } from '../src/modules/food/landing/models/diningBanner.model.js';
import { HomePromotionBanner } from '../src/modules/food/landing/models/homePromotionBanner.model.js';
import { FoodExploreIcon } from '../src/modules/food/landing/models/exploreIcon.model.js';

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error('Missing MONGO_URI or MONGODB_URI in Backend/.env');
}

const uploadBaseUrl = String(process.env.UPLOAD_BASE_URL || 'http://localhost:5000/uploads').replace(/\/$/, '');
const seedBase = `${uploadBaseUrl}/seed`;

const seededRestaurantMedia = {
  'Poha Junction': {
    profileImage: `${seedBase}/restaurants/restaurant_profile_1.jpeg`,
    coverImages: [`${seedBase}/restaurants/restaurant_cover_1.jpg`],
  },
  'Sarafa Sweets & Snacks': {
    profileImage: `${seedBase}/restaurants/restaurant_profile_1.jpeg`,
    coverImages: [`${seedBase}/restaurants/restaurant_cover_2.png`],
  },
  'Chatori Galli': {
    profileImage: `${seedBase}/restaurants/restaurant_profile_1.jpeg`,
    coverImages: [`${seedBase}/restaurants/restaurant_cover_1.jpg`],
  },
  'Narmada Family Dhaba': {
    profileImage: `${seedBase}/restaurants/restaurant_profile_1.jpeg`,
    coverImages: [`${seedBase}/restaurants/restaurant_cover_2.png`],
  },
  '56 Dukan Bites': {
    profileImage: `${seedBase}/restaurants/restaurant_profile_1.jpeg`,
    coverImages: [`${seedBase}/restaurants/restaurant_cover_1.jpg`],
  }
};

const categorySeeds = [
  { name: 'Breakfast', sortOrder: 1, image: `${seedBase}/foods/steamed_rice.png`, foodTypeScope: 'Both' },
  { name: 'Snacks', sortOrder: 2, image: `${seedBase}/foods/veg_spring_roll.png`, foodTypeScope: 'Both' },
  { name: 'Main Course', sortOrder: 3, image: `${seedBase}/foods/dal_tadka.png`, foodTypeScope: 'Both' },
  { name: 'Chinese', sortOrder: 4, image: `${seedBase}/foods/veg_chowmein.png`, foodTypeScope: 'Both' },
  { name: 'Breads', sortOrder: 5, image: `${seedBase}/foods/roti.png`, foodTypeScope: 'Both' }
];

const foodSeedsByRestaurant = {
  'Poha Junction': [
    {
      name: 'Indori Poha',
      categoryName: 'Breakfast',
      description: 'Classic Indore style poha topped with sev and pomegranate.',
      price: 60,
      otherPrice: 79,
      image: `${seedBase}/foods/steamed_rice.png`,
      foodType: 'Veg',
      isRecommended: true,
      preparationTime: '15 mins'
    },
    {
      name: 'Jalebi Combo',
      categoryName: 'Breakfast',
      description: 'Fresh jalebi served with signature poha.',
      price: 95,
      otherPrice: 120,
      image: `${seedBase}/foods/veg_spring_roll.png`,
      foodType: 'Veg',
      isRecommended: false,
      preparationTime: '18 mins'
    }
  ],
  'Sarafa Sweets & Snacks': [
    {
      name: 'Malpua Rabdi',
      categoryName: 'Snacks',
      description: 'Golden malpua served with thick chilled rabdi.',
      price: 140,
      otherPrice: 170,
      image: `${seedBase}/foods/dal_tadka.png`,
      foodType: 'Veg',
      isRecommended: true,
      preparationTime: '20 mins'
    },
    {
      name: 'Bhutte Ka Kees',
      categoryName: 'Snacks',
      description: 'Indori street-style grated corn delicacy.',
      price: 110,
      otherPrice: 140,
      image: `${seedBase}/foods/veg_chowmein.png`,
      foodType: 'Veg',
      isRecommended: false,
      preparationTime: '15 mins'
    }
  ],
  'Chatori Galli': [
    {
      name: 'Paneer Tikka Roll',
      categoryName: 'Main Course',
      description: 'Loaded paneer tikka roll with house chutneys.',
      price: 180,
      otherPrice: 220,
      image: `${seedBase}/foods/veg_spring_roll.png`,
      foodType: 'Veg',
      isRecommended: true,
      preparationTime: '22 mins'
    },
    {
      name: 'Chilli Garlic Noodles',
      categoryName: 'Chinese',
      description: 'Wok-tossed noodles with chilli garlic sauce.',
      price: 170,
      otherPrice: 210,
      image: `${seedBase}/foods/veg_chowmein.png`,
      foodType: 'Veg',
      isRecommended: false,
      preparationTime: '20 mins'
    }
  ],
  'Narmada Family Dhaba': [
    {
      name: 'Butter Chicken',
      categoryName: 'Main Course',
      description: 'Rich butter chicken with creamy tomato gravy.',
      price: 320,
      otherPrice: 360,
      image: `${seedBase}/foods/dal_tadka.png`,
      foodType: 'Non-Veg',
      isRecommended: true,
      preparationTime: '28 mins'
    },
    {
      name: 'Tandoori Roti Basket',
      categoryName: 'Breads',
      description: 'Fresh tandoori rotis served hot from the clay oven.',
      price: 80,
      otherPrice: 100,
      image: `${seedBase}/foods/roti.png`,
      foodType: 'Veg',
      isRecommended: false,
      preparationTime: '12 mins'
    }
  ],
  '56 Dukan Bites': [
    {
      name: 'Dahi Puri',
      categoryName: 'Snacks',
      description: 'Crisp puris loaded with curd, chutneys and masala.',
      price: 90,
      otherPrice: 120,
      image: `${seedBase}/foods/veg_spring_roll.png`,
      foodType: 'Veg',
      isRecommended: true,
      preparationTime: '12 mins'
    },
    {
      name: 'Veg Hakka Noodles',
      categoryName: 'Chinese',
      description: 'Street-style Hakka noodles with veggies.',
      price: 150,
      otherPrice: 185,
      image: `${seedBase}/foods/veg_chowmein.png`,
      foodType: 'Veg',
      isRecommended: false,
      preparationTime: '18 mins'
    }
  ]
};

const topBannerSeeds = [
  { image: `${seedBase}/banners/offerpagebanner.png`, order: 1, isActive: true, publicId: 'seed/top-offerpagebanner' },
  { image: `${seedBase}/banners/collectionspagebanner.png`, order: 2, isActive: true, publicId: 'seed/top-collectionspagebanner' }
];

const heroBannerSeeds = [
  {
    imageUrl: `${seedBase}/banners/switch99banner_clean.png`,
    publicId: 'seed/hero-switch99banner-clean',
    title: 'Switch 99 Deals',
    ctaText: 'Order now',
    ctaLink: '/food/user/under250',
    restaurantNames: ['56 Dukan Bites', 'Poha Junction'],
    sortOrder: 1
  },
  {
    imageUrl: `${seedBase}/banners/gourmetpagebanner.png`,
    publicId: 'seed/hero-gourmetpagebanner',
    title: 'Gourmet Picks in Indore',
    ctaText: 'Explore gourmet',
    ctaLink: '/food/user/gourmet',
    restaurantNames: ['Sarafa Sweets & Snacks', 'Chatori Galli'],
    sortOrder: 2
  }
];

const under250BannerSeeds = [
  {
    imageUrl: `${seedBase}/banners/switch99banner_clean.png`,
    publicId: 'seed/under250-switch99',
    title: 'Meals under 250',
    ctaText: 'View all',
    ctaLink: '/food/user/under250',
    sortOrder: 1,
    isActive: true
  }
];

const diningBannerSeeds = [
  {
    imageUrl: `${seedBase}/banners/gourmetpagebanner.png`,
    publicId: 'seed/dining-gourmet',
    title: 'Family dining in Indore',
    ctaText: 'Book a table',
    ctaLink: '/food/user/dining',
    diningType: 'family-dining',
    sortOrder: 1,
    isActive: true
  }
];

const homePromotionSeeds = [
  {
    imageUrl: `${seedBase}/banners/offerpagebanner.png`,
    publicId: 'seed/home-promo-offers',
    title: 'Weekend Offer Drop',
    ctaLink: '/food/user/offers',
    sortOrder: 1,
    isActive: true
  },
  {
    imageUrl: `${seedBase}/banners/collectionspagebanner.png`,
    publicId: 'seed/home-promo-collections',
    title: 'Curated Collections',
    ctaLink: '/food/user/collections',
    sortOrder: 2,
    isActive: true
  }
];

const exploreIconSeeds = [
  {
    label: 'Offers',
    iconUrl: `${seedBase}/banners/offerpagebanner.png`,
    publicId: 'seed/explore-offers',
    linkType: 'offers',
    targetPath: '/food/user/offers',
    sortOrder: 1,
    isActive: true
  },
  {
    label: 'Gourmet',
    iconUrl: `${seedBase}/banners/gourmetpagebanner.png`,
    publicId: 'seed/explore-gourmet',
    linkType: 'gourmet',
    targetPath: '/food/user/gourmet',
    sortOrder: 2,
    isActive: true
  },
  {
    label: 'Switch 99',
    iconUrl: `${seedBase}/banners/switch99banner_clean.png`,
    publicId: 'seed/explore-switch99',
    linkType: 'custom',
    targetPath: '/food/user/under250',
    sortOrder: 3,
    isActive: true
  },
  {
    label: 'Collections',
    iconUrl: `${seedBase}/banners/collectionspagebanner.png`,
    publicId: 'seed/explore-collections',
    linkType: 'collections',
    targetPath: '/food/user/collections',
    sortOrder: 4,
    isActive: true
  }
];

async function upsertCategories() {
  const categories = new Map();
  for (const seed of categorySeeds) {
    const category = await FoodCategory.findOneAndUpdate(
      { name: seed.name, restaurantId: { $exists: false } },
      {
        $set: {
          image: seed.image,
          type: 'food',
          foodTypeScope: seed.foodTypeScope,
          approvalStatus: 'approved',
          isApproved: true,
          isActive: true,
          sortOrder: seed.sortOrder,
          approvedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    categories.set(seed.name, category);
  }
  return categories;
}

async function updateRestaurantMedia() {
  for (const [restaurantName, media] of Object.entries(seededRestaurantMedia)) {
    await FoodRestaurant.updateOne(
      { restaurantName },
      {
        $set: {
          profileImage: media.profileImage,
          coverImages: media.coverImages,
          menuImages: media.coverImages
        }
      }
    );
  }
}

async function upsertFoodItems(categories) {
  const restaurants = await FoodRestaurant.find({ restaurantName: { $in: Object.keys(foodSeedsByRestaurant) } })
    .select('_id restaurantName')
    .lean();

  const restaurantMap = new Map(restaurants.map((restaurant) => [restaurant.restaurantName, restaurant]));

  for (const [restaurantName, items] of Object.entries(foodSeedsByRestaurant)) {
    const restaurant = restaurantMap.get(restaurantName);
    if (!restaurant) continue;

    for (const item of items) {
      const category = categories.get(item.categoryName);
      await FoodItem.findOneAndUpdate(
        { restaurantId: restaurant._id, name: item.name },
        {
          $set: {
            restaurantId: restaurant._id,
            categoryId: category?._id,
            categoryName: item.categoryName,
            description: item.description,
            price: item.price,
            otherPrice: item.otherPrice,
            image: item.image,
            foodType: item.foodType,
            isAvailable: true,
            isRecommended: item.isRecommended,
            preparationTime: item.preparationTime,
            approvalStatus: 'approved',
            approvedAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }
}

async function upsertTopBanners() {
  for (const seed of topBannerSeeds) {
    await TopBanner.findOneAndUpdate(
      { publicId: seed.publicId },
      { $set: seed },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertHeroBanners() {
  const restaurants = await FoodRestaurant.find({ restaurantName: { $in: heroBannerSeeds.flatMap((banner) => banner.restaurantNames) } })
    .select('_id restaurantName')
    .lean();
  const restaurantMap = new Map(restaurants.map((restaurant) => [restaurant.restaurantName, restaurant._id]));

  for (const seed of heroBannerSeeds) {
    await FoodHeroBanner.findOneAndUpdate(
      { publicId: seed.publicId },
      {
        $set: {
          imageUrl: seed.imageUrl,
          publicId: seed.publicId,
          title: seed.title,
          ctaText: seed.ctaText,
          ctaLink: seed.ctaLink,
          linkedRestaurantIds: seed.restaurantNames.map((name) => restaurantMap.get(name)).filter(Boolean),
          sortOrder: seed.sortOrder,
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertUnder250Banners() {
  for (const seed of under250BannerSeeds) {
    await FoodUnder250Banner.findOneAndUpdate(
      { publicId: seed.publicId },
      { $set: seed },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertDiningBanners() {
  for (const seed of diningBannerSeeds) {
    await FoodDiningBanner.findOneAndUpdate(
      { publicId: seed.publicId },
      { $set: seed },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertHomePromotionBanners() {
  for (const seed of homePromotionSeeds) {
    await HomePromotionBanner.findOneAndUpdate(
      { publicId: seed.publicId },
      { $set: seed },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function upsertExploreIcons() {
  for (const seed of exploreIconSeeds) {
    await FoodExploreIcon.findOneAndUpdate(
      { publicId: seed.publicId },
      { $set: seed },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
}

async function main() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const categories = await upsertCategories();
  await updateRestaurantMedia();
  await upsertFoodItems(categories);
  await upsertTopBanners();
  await upsertHeroBanners();
  await upsertUnder250Banners();
  await upsertDiningBanners();
  await upsertHomePromotionBanners();
  await upsertExploreIcons();

  console.log('Seeded homepage banners, restaurant media, categories, and dishes.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
