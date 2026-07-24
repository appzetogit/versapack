/**
 * Read-only restaurant analytics export.
 * Generates a multi-sheet Excel workbook — does NOT modify the database.
 *
 * Usage:
 *   node scripts/export-restaurant-analytics-report.js
 *   node scripts/export-restaurant-analytics-report.js --status approved
 *   node scripts/export-restaurant-analytics-report.js --output ./reports/my-report.xlsx
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import '../src/modules/food/orders/models/foodTransaction.model.js';
import { isCancelledOrder, CANCELLED_ORDER_STATUSES } from '../src/modules/food/orders/services/order.helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const IST = 'Asia/Kolkata';

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const round2 = (v) => Math.round(toNum(v, 0) * 100) / 100;

const formatDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { timeZone: IST });
};

const monthKeyFromDate = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return year && month ? `${year}-${month}` : null;
};

const parseArgs = () => {
  const raw = process.argv.slice(2);
  const args = { status: 'all' };
  for (let i = 0; i < raw.length; i += 1) {
    const key = raw[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = raw[i + 1];
  }
  return args;
};

const getTransactionDoc = (order) => {
  const tx = order?.transactionId;
  return tx && typeof tx === 'object' ? tx : {};
};

const isEarnedOrder = (order) => {
  if (isCancelledOrder(order)) return false;
  const orderStatus = String(order?.orderStatus || order?.status || '').trim().toLowerCase();
  const deliveryPhase = String(order?.deliveryState?.currentPhase || '').trim().toLowerCase();
  return (
    orderStatus === 'delivered' ||
    deliveryPhase === 'delivered' ||
    deliveryPhase === 'completed'
  );
};

const calculateOrderPayout = (order) => {
  if (!isEarnedOrder(order)) return 0;

  const tx = getTransactionDoc(order);
  const pricing = tx.pricing || order?.pricing || {};
  const amounts = tx.amounts || {};
  const storedRestaurantShare = Number(amounts.restaurantShare);
  if (Number.isFinite(storedRestaurantShare)) {
    return Math.max(0, storedRestaurantShare);
  }

  const subtotal = Number(pricing.subtotal) || 0;
  const packagingFee = Number(pricing.packagingFee) || 0;
  const commission = Number(amounts.restaurantCommission) || Number(pricing.restaurantCommission) || 0;
  const restaurantDiscountShare = Number(amounts.restaurantDiscountShare) || 0;
  return Math.max(0, subtotal + packagingFee - commission - restaurantDiscountShare);
};

const calculateCustomerGmv = (order) => {
  if (!isEarnedOrder(order)) return 0;

  const tx = getTransactionDoc(order);
  const pricing = tx.pricing || order?.pricing || {};
  const amounts = tx.amounts || {};
  const fromTx = Number(amounts.totalCustomerPaid);
  if (Number.isFinite(fromTx) && fromTx > 0) return fromTx;
  return Math.max(0, Number(pricing.total) || 0);
};

const styleHeaderRow = (sheet) => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' },
  };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 22;
};

const autoFitColumns = (sheet, minWidth = 12, maxWidth = 42) => {
  sheet.columns.forEach((col) => {
    let maxLen = String(col.header || '').length;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxWidth, Math.max(minWidth, maxLen + 2));
  });
};

const generateMonthRange = (startMonthKey, endMonthKey) => {
  if (!startMonthKey || !endMonthKey) return [];
  const [sy, sm] = startMonthKey.split('-').map(Number);
  const [ey, em] = endMonthKey.split('-').map(Number);
  const months = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
};

const fetchRestaurants = async (statusFilter) => {
  const query = {};
  if (statusFilter && statusFilter !== 'all') {
    query.status = statusFilter;
  }
  return FoodRestaurant.find(query)
    .select(
      'restaurantName ownerName ownerPhone ownerEmail status createdAt approvedAt city state subscriptionPlan subscriptionStatus subscriptionDueAmount subscriptionPaidAmount subscriptionAutoDeductedAmount subscriptionValidTill subscriptionAmount'
    )
    .sort({ createdAt: 1 })
    .lean();
};

const fetchAllOrders = async () => {
  return FoodOrder.find({ orderStatus: { $nin: ['pending_payment'] } })
    .populate('transactionId')
    .select('restaurantId orderStatus status deliveryState pricing createdAt transactionId')
    .lean();
};

const fetchWithdrawalStats = async () => {
  const rows = await mongoose.connection.db.collection('food_restaurant_withdrawals').aggregate([
    {
      $group: {
        _id: '$restaurantId',
        withdrawnAmount: {
          $sum: {
            $cond: [{ $eq: [{ $toLower: { $trim: { input: { $ifNull: ['$status', ''] } } } }, 'approved'] }, '$amount', 0],
          },
        },
        pendingWithdrawal: {
          $sum: {
            $cond: [{ $eq: [{ $toLower: { $trim: { input: { $ifNull: ['$status', ''] } } } }, 'pending'] }, '$amount', 0],
          },
        },
      },
    },
  ]).toArray();

  const map = new Map();
  for (const row of rows) {
    map.set(String(row._id), row);
  }
  return map;
};

const buildFinanceFromOrders = (orders) => {
  const lifetimeMap = new Map();
  const monthlyMap = new Map();
  const orderStatsMap = new Map();

  for (const order of orders) {
    const restaurantId = String(order.restaurantId || '');
    if (!restaurantId) continue;

    if (!orderStatsMap.has(restaurantId)) {
      orderStatsMap.set(restaurantId, { totalOrders: 0, completedOrders: 0, cancelledOrders: 0 });
    }
    const stats = orderStatsMap.get(restaurantId);
    stats.totalOrders += 1;

    const statusNormalized = String(order.orderStatus || order.status || '').trim().toLowerCase();
    if (CANCELLED_ORDER_STATUSES.includes(statusNormalized)) {
      stats.cancelledOrders += 1;
    }
    if (isEarnedOrder(order)) {
      stats.completedOrders += 1;
    }

    if (!isEarnedOrder(order)) continue;

    const payout = calculateOrderPayout(order);
    const customerGmv = calculateCustomerGmv(order);

    if (!lifetimeMap.has(restaurantId)) {
      lifetimeMap.set(restaurantId, {
        lifetimeGmv: 0,
        lifetimeEarnings: 0,
        lifetimeCustomerGmv: 0,
        completedOrderCount: 0,
      });
    }
    const lifetime = lifetimeMap.get(restaurantId);
    lifetime.lifetimeGmv += payout;
    lifetime.lifetimeEarnings += payout;
    lifetime.lifetimeCustomerGmv += customerGmv;
    lifetime.completedOrderCount += 1;

    const monthKey = monthKeyFromDate(order.createdAt);
    if (!monthKey) continue;
    const monthlyKey = `${restaurantId}::${monthKey}`;
    if (!monthlyMap.has(monthlyKey)) {
      monthlyMap.set(monthlyKey, { restaurantGmv: 0, customerGmv: 0, orderCount: 0 });
    }
    const monthly = monthlyMap.get(monthlyKey);
    monthly.restaurantGmv += payout;
    monthly.customerGmv += customerGmv;
    monthly.orderCount += 1;
  }

  return { lifetimeMap, monthlyMap, orderStatsMap };
};

const fetchSubscriptionCycles = async () => {
  return mongoose.connection.db
    .collection('food_restaurant_subscription_cycles')
    .find({})
    .sort({ restaurantId: 1, cycleKey: 1 })
    .toArray();
};

const PAYMENT_EVENT_TYPES = ['subscription_payment', 'subscription_auto_deduct'];

const fetchSubscriptionPaymentHistory = async () => {
  return mongoose.connection.db
    .collection('food_restaurant_subscription_history')
    .find({ eventType: { $in: PAYMENT_EVENT_TYPES } })
    .sort({ restaurantId: 1, createdAt: 1 })
    .toArray();
};

const formatPaymentType = (eventType) => {
  if (eventType === 'subscription_auto_deduct') return 'Auto Deduct';
  return 'Manual Payment';
};

const formatCycleMode = (metadata = {}) => {
  const mode = String(metadata?.mode || '').trim().toLowerCase();
  if (mode === 'onboarding') return 'Onboarding';
  if (mode === 'renewal') return 'Renewal';
  return mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Renewal';
};

const buildSubscriptionPaymentData = (historyRows, restaurantNameById, restaurantById) => {
  const byRestaurant = new Map();

  for (const row of historyRows) {
    const restaurantId = String(row.restaurantId || '');
    if (!restaurantId) continue;

    const amount = round2(row.amount);
    const isPaid = amount > 0;
    const entry = {
      restaurantId,
      restaurantName: restaurantNameById.get(restaurantId) || '',
      paymentDate: row.createdAt,
      paymentDateIst: formatDateTime(row.createdAt),
      eventType: row.eventType || '',
      paymentType: formatPaymentType(row.eventType),
      amount,
      plan: row.plan || '',
      cycleMode: formatCycleMode(row.metadata),
      paymentMethod: String(row.paymentType || '').trim() || '—',
      note: String(row.note || '').trim(),
      isPaid,
    };

    if (!byRestaurant.has(restaurantId)) {
      byRestaurant.set(restaurantId, []);
    }
    byRestaurant.get(restaurantId).push(entry);
  }

  const payerSummaries = [];
  const paymentDetails = [];

  for (const [restaurantId, events] of byRestaurant.entries()) {
    const paidEvents = events.filter((e) => e.isPaid);
    if (paidEvents.length === 0) continue;

    const restaurant = restaurantById.get(restaurantId) || {};
    let cycleNumber = 0;

    for (const event of events) {
      if (!event.isPaid) continue;
      cycleNumber += 1;
      paymentDetails.push({
        ...event,
        cycleNumber,
        cycleLabel: event.cycleMode === 'Onboarding' && cycleNumber === 1
          ? 'Cycle 1 (Onboarding)'
          : `Cycle ${cycleNumber}`,
      });
    }

    const manualCount = paidEvents.filter((e) => e.eventType === 'subscription_payment').length;
    const autoDeductCount = paidEvents.filter((e) => e.eventType === 'subscription_auto_deduct').length;
    const totalPaid = round2(paidEvents.reduce((s, e) => s + e.amount, 0));

    payerSummaries.push({
      restaurantId,
      restaurantName: restaurant.restaurantName || events[0]?.restaurantName || '',
      joinDate: formatDate(restaurant.createdAt),
      timesPaid: paidEvents.length,
      manualPayments: manualCount,
      autoDeductPayments: autoDeductCount,
      totalPaid,
      firstPaymentDate: formatDateTime(paidEvents[0].paymentDate),
      lastPaymentDate: formatDateTime(paidEvents[paidEvents.length - 1].paymentDate),
      currentDue: round2(restaurant.subscriptionDueAmount),
      currentPaidOnRecord: round2(restaurant.subscriptionPaidAmount),
      subscriptionPlan: restaurant.subscriptionPlan || '',
      subscriptionStatus: restaurant.subscriptionStatus || '',
    });
  }

  payerSummaries.sort((a, b) => b.timesPaid - a.timesPaid || b.totalPaid - a.totalPaid);
  paymentDetails.sort((a, b) => {
    const nameCmp = a.restaurantName.localeCompare(b.restaurantName);
    if (nameCmp !== 0) return nameCmp;
    return a.cycleNumber - b.cycleNumber;
  });

  return { payerSummaries, paymentDetails };
};

const buildWorkbook = async ({
  restaurants,
  orderStatsMap,
  lifetimeMap,
  monthlyMap,
  withdrawalMap,
  subscriptionCycles,
  subscriptionPaymentHistory,
  statusFilter,
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Appzeto Restaurant Analytics Export';
  workbook.created = new Date();

  const currentMonthKey = monthKeyFromDate(new Date());
  let grandLifetimeEarnings = 0;
  let grandLifetimeGmv = 0;
  let grandCustomerGmv = 0;
  let grandTotalOrders = 0;
  let grandCompletedOrders = 0;
  let grandSubscriptionDue = 0;
  let grandSubscriptionPaid = 0;
  let grandWithdrawn = 0;

  const restaurantRows = restaurants.map((r) => {
    const id = String(r._id);
    const orderStats = orderStatsMap.get(id) || {};
    const finance = lifetimeMap.get(id) || {};
    const withdrawals = withdrawalMap.get(id) || {};
    const lifetimeGmv = round2(finance.lifetimeGmv);
    const lifetimeEarnings = round2(finance.lifetimeEarnings);
    const customerGmv = round2(finance.lifetimeCustomerGmv);
    const withdrawnAmount = round2(withdrawals.withdrawnAmount);
    const pendingWithdrawal = round2(withdrawals.pendingWithdrawal);
    const totalOrders = toNum(orderStats.totalOrders, 0);
    const completedOrders = toNum(orderStats.completedOrders, 0);
    const subscriptionDue = round2(r.subscriptionDueAmount);
    const subscriptionPaid = round2(r.subscriptionPaidAmount);

    grandLifetimeGmv += lifetimeGmv;
    grandLifetimeEarnings += lifetimeEarnings;
    grandCustomerGmv += customerGmv;
    grandTotalOrders += totalOrders;
    grandCompletedOrders += completedOrders;
    grandSubscriptionDue += subscriptionDue;
    grandSubscriptionPaid += subscriptionPaid;
    grandWithdrawn += withdrawnAmount;

    return {
      id,
      restaurant: r,
      lifetimeGmv,
      lifetimeEarnings,
      customerGmv,
      withdrawnAmount,
      pendingWithdrawal,
      totalOrders,
      completedOrders,
      cancelledOrders: toNum(orderStats.cancelledOrders, 0),
      subscriptionDue,
      subscriptionPaid,
      joinMonthKey: monthKeyFromDate(r.createdAt),
    };
  });

  // Sheet 1: Overview
  const overview = workbook.addWorksheet('Overview');
  overview.columns = [
    { header: 'Metric', key: 'metric', width: 42 },
    { header: 'Value', key: 'value', width: 30 },
  ];
  styleHeaderRow(overview);
  const overviewData = [
    { metric: 'Report Generated At (IST)', value: formatDateTime(new Date()) },
    { metric: 'Restaurant Filter', value: statusFilter === 'all' ? 'All statuses' : statusFilter },
    { metric: 'Total Restaurants', value: restaurants.length },
    { metric: 'Approved Restaurants', value: restaurants.filter((r) => r.status === 'approved').length },
    { metric: 'Pending Restaurants', value: restaurants.filter((r) => r.status === 'pending').length },
    { metric: 'Rejected Restaurants', value: restaurants.filter((r) => r.status === 'rejected').length },
    { metric: 'Grand Total Orders', value: grandTotalOrders },
    { metric: 'Grand Completed Orders', value: grandCompletedOrders },
    { metric: 'Grand Lifetime GMV / Earnings (INR)', value: round2(grandLifetimeGmv) },
    { metric: 'Grand Lifetime Customer GMV (INR)', value: round2(grandCustomerGmv) },
    { metric: 'Grand Withdrawn Amount (INR)', value: round2(grandWithdrawn) },
    { metric: 'Grand Subscription Due (INR)', value: round2(grandSubscriptionDue) },
    { metric: 'Grand Subscription Paid (INR)', value: round2(grandSubscriptionPaid) },
    {
      metric: 'GMV / Earnings Definition',
      value: 'Calculated from delivered/completed orders. Uses transaction restaurantShare when available, otherwise order pricing payout formula.',
    },
    {
      metric: 'Lifetime Earnings Note',
      value: 'Total gross payout from all completed orders. NOT reduced by withdrawals — withdrawn amount is shown separately.',
    },
    { metric: 'Monthly GMV Note', value: 'Calendar months in IST from join month through current month. Partial join month includes full month orders.' },
  ];
  overviewData.forEach((row) => overview.addRow(row));

  // Sheet 2: All Restaurants
  const allRestaurants = workbook.addWorksheet('All Restaurants');
  allRestaurants.columns = [
    { header: 'S.No', key: 'sno', width: 8 },
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Owner Name', key: 'ownerName', width: 22 },
    { header: 'Owner Phone', key: 'ownerPhone', width: 16 },
    { header: 'Owner Email', key: 'ownerEmail', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'State', key: 'state', width: 14 },
    { header: 'Joining Date (IST)', key: 'joinDate', width: 18 },
    { header: 'Approved Date (IST)', key: 'approvedAt', width: 20 },
    { header: 'Total Orders', key: 'totalOrders', width: 14 },
    { header: 'Completed Orders', key: 'completedOrders', width: 16 },
    { header: 'Cancelled Orders', key: 'cancelledOrders', width: 16 },
    { header: 'Lifetime GMV (INR)', key: 'lifetimeGmv', width: 20 },
    { header: 'Lifetime Earnings (INR)', key: 'lifetimeEarnings', width: 22 },
    { header: 'Withdrawn Amount (INR)', key: 'withdrawnAmount', width: 22 },
    { header: 'Pending Withdrawal (INR)', key: 'pendingWithdrawal', width: 22 },
    { header: 'Lifetime Customer GMV (INR)', key: 'customerGmv', width: 24 },
    { header: 'Subscription Plan', key: 'subscriptionPlan', width: 16 },
    { header: 'Subscription Status', key: 'subscriptionStatus', width: 18 },
    { header: 'Subscription Due (INR)', key: 'subscriptionDue', width: 20 },
    { header: 'Subscription Paid (INR)', key: 'subscriptionPaid', width: 20 },
    { header: 'Auto Deducted (INR)', key: 'autoDeducted', width: 18 },
    { header: 'Subscription Valid Till', key: 'validTill', width: 20 },
  ];
  styleHeaderRow(allRestaurants);

  restaurantRows.forEach((row, idx) => {
    const r = row.restaurant;
    allRestaurants.addRow({
      sno: idx + 1,
      id: row.id,
      name: r.restaurantName || '',
      ownerName: r.ownerName || '',
      ownerPhone: r.ownerPhone || '',
      ownerEmail: r.ownerEmail || '',
      status: r.status || '',
      city: r.city || '',
      state: r.state || '',
      joinDate: formatDate(r.createdAt),
      approvedAt: formatDate(r.approvedAt),
      totalOrders: row.totalOrders,
      completedOrders: row.completedOrders,
      cancelledOrders: row.cancelledOrders,
      lifetimeGmv: row.lifetimeGmv,
      lifetimeEarnings: row.lifetimeEarnings,
      withdrawnAmount: row.withdrawnAmount,
      pendingWithdrawal: row.pendingWithdrawal,
      customerGmv: row.customerGmv,
      subscriptionPlan: r.subscriptionPlan || '',
      subscriptionStatus: r.subscriptionStatus || '',
      subscriptionDue: row.subscriptionDue,
      subscriptionPaid: row.subscriptionPaid,
      autoDeducted: round2(r.subscriptionAutoDeductedAmount),
      validTill: formatDate(r.subscriptionValidTill),
    });
  });
  autoFitColumns(allRestaurants);

  // Sheet 3: Monthly GMV (wide format — one column per month)
  const allMonthKeys = new Set();
  for (const row of restaurantRows) {
    const months = generateMonthRange(row.joinMonthKey, currentMonthKey);
    months.forEach((m) => allMonthKeys.add(m));
  }
  const sortedMonthKeys = [...allMonthKeys].sort();

  const monthlyWide = workbook.addWorksheet('Monthly GMV (Wide)');
  const wideHeaders = [
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Joining Date', key: 'joinDate', width: 16 },
    { header: 'Join Month', key: 'joinMonth', width: 12 },
    ...sortedMonthKeys.map((m) => ({ header: `${m} GMV`, key: `gmv_${m}`, width: 14 })),
    { header: 'Total GMV', key: 'totalGmv', width: 14 },
  ];
  monthlyWide.columns = wideHeaders;
  styleHeaderRow(monthlyWide);

  for (const row of restaurantRows) {
    const r = row.restaurant;
    const wideRow = {
      id: row.id,
      name: r.restaurantName || '',
      joinDate: formatDate(r.createdAt),
      joinMonth: row.joinMonthKey || '',
      totalGmv: 0,
    };
    const months = generateMonthRange(row.joinMonthKey, currentMonthKey);
    for (const month of months) {
      const data = monthlyMap.get(`${row.id}::${month}`);
      const gmv = round2(data?.restaurantGmv);
      wideRow[`gmv_${month}`] = gmv;
      wideRow.totalGmv = round2(wideRow.totalGmv + gmv);
    }
    monthlyWide.addRow(wideRow);
  }
  autoFitColumns(monthlyWide);

  // Sheet 4: Monthly GMV (long format — easier to filter/pivot)
  const monthlyLong = workbook.addWorksheet('Monthly GMV (Detail)');
  monthlyLong.columns = [
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Joining Date', key: 'joinDate', width: 16 },
    { header: 'Month (YYYY-MM)', key: 'month', width: 14 },
    { header: 'Restaurant GMV (INR)', key: 'restaurantGmv', width: 20 },
    { header: 'Customer GMV (INR)', key: 'customerGmv', width: 20 },
    { header: 'Completed Orders', key: 'orderCount', width: 16 },
    { header: 'Is Join Month', key: 'isJoinMonth', width: 14 },
  ];
  styleHeaderRow(monthlyLong);

  for (const row of restaurantRows) {
    const r = row.restaurant;
    const months = generateMonthRange(row.joinMonthKey, currentMonthKey);
    for (const month of months) {
      const data = monthlyMap.get(`${row.id}::${month}`);
      monthlyLong.addRow({
        id: row.id,
        name: r.restaurantName || '',
        joinDate: formatDate(r.createdAt),
        month,
        restaurantGmv: round2(data?.restaurantGmv),
        customerGmv: round2(data?.customerGmv),
        orderCount: toNum(data?.orderCount, 0),
        isJoinMonth: month === row.joinMonthKey ? 'Yes' : 'No',
      });
    }
  }
  autoFitColumns(monthlyLong);

  // Sheet 5: Subscription Summary
  const subSummary = workbook.addWorksheet('Subscription Summary');
  subSummary.columns = [
    { header: 'Restaurant ID', key: 'id', width: 26 },
    { header: 'Restaurant Name', key: 'name', width: 30 },
    { header: 'Joining Date', key: 'joinDate', width: 16 },
    { header: 'Plan', key: 'plan', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Due (INR)', key: 'due', width: 14 },
    { header: 'Paid (INR)', key: 'paid', width: 14 },
    { header: 'Auto Deducted (INR)', key: 'autoDeducted', width: 18 },
    { header: 'Total Billed (INR)', key: 'totalBilled', width: 16 },
    { header: 'Valid Till', key: 'validTill', width: 18 },
    { header: 'Cycle Due Total (INR)', key: 'cycleDueTotal', width: 18 },
    { header: 'Cycle Paid Total (INR)', key: 'cyclePaidTotal', width: 18 },
    { header: 'Open Cycles', key: 'openCycles', width: 12 },
  ];
  styleHeaderRow(subSummary);

  const cyclesByRestaurant = new Map();
  for (const cycle of subscriptionCycles) {
    const rid = String(cycle.restaurantId);
    if (!cyclesByRestaurant.has(rid)) cyclesByRestaurant.set(rid, []);
    cyclesByRestaurant.get(rid).push(cycle);
  }

  for (const row of restaurantRows) {
    const r = row.restaurant;
    const cycles = cyclesByRestaurant.get(row.id) || [];
    const cycleDueTotal = round2(cycles.reduce((s, c) => s + toNum(c.dueAmount), 0));
    const cyclePaidTotal = round2(cycles.reduce((s, c) => s + toNum(c.paidAmount), 0));
    const openCycles = cycles.filter((c) => !['paid', 'waived'].includes(c.status)).length;

    subSummary.addRow({
      id: row.id,
      name: r.restaurantName || '',
      joinDate: formatDate(r.createdAt),
      plan: r.subscriptionPlan || '',
      status: r.subscriptionStatus || '',
      due: row.subscriptionDue,
      paid: row.subscriptionPaid,
      autoDeducted: round2(r.subscriptionAutoDeductedAmount),
      totalBilled: round2(r.subscriptionAmount),
      validTill: formatDate(r.subscriptionValidTill),
      cycleDueTotal,
      cyclePaidTotal,
      openCycles,
    });
  }
  autoFitColumns(subSummary);

  // Sheet 6: Subscription Cycles Detail
  const subCycles = workbook.addWorksheet('Subscription Cycles');
  subCycles.columns = [
    { header: 'Restaurant ID', key: 'restaurantId', width: 26 },
    { header: 'Restaurant Name', key: 'restaurantName', width: 30 },
    { header: 'Cycle Key', key: 'cycleKey', width: 12 },
    { header: 'Cycle Start', key: 'cycleStart', width: 18 },
    { header: 'Cycle End', key: 'cycleEnd', width: 18 },
    { header: 'Plan', key: 'plan', width: 12 },
    { header: 'Plan Total (INR)', key: 'planTotal', width: 16 },
    { header: 'Due (INR)', key: 'dueAmount', width: 14 },
    { header: 'Paid (INR)', key: 'paidAmount', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Payment Mode', key: 'paymentMode', width: 16 },
    { header: 'GMV Snapshot (30d)', key: 'gmvLast30Days', width: 18 },
    { header: 'Onboarding Cycle', key: 'onboardingCycle', width: 16 },
  ];
  styleHeaderRow(subCycles);

  const restaurantNameById = new Map(
    restaurantRows.map((r) => [r.id, r.restaurant.restaurantName || ''])
  );

  for (const cycle of subscriptionCycles) {
    const rid = String(cycle.restaurantId);
    subCycles.addRow({
      restaurantId: rid,
      restaurantName: restaurantNameById.get(rid) || '',
      cycleKey: cycle.cycleKey || '',
      cycleStart: formatDate(cycle.cycleStart),
      cycleEnd: formatDate(cycle.cycleEnd),
      plan: cycle.plan || '',
      planTotal: round2(cycle.planTotal),
      dueAmount: round2(cycle.dueAmount),
      paidAmount: round2(cycle.paidAmount),
      status: cycle.status || '',
      paymentMode: cycle.paymentMode || '',
      gmvLast30Days: round2(cycle.gmvLast30Days),
      onboardingCycle: cycle.onboardingCycle ? 'Yes' : 'No',
    });
  }
  autoFitColumns(subCycles);

  const restaurantById = new Map(
    restaurantRows.map((r) => [r.id, r.restaurant])
  );
  const { payerSummaries, paymentDetails } = buildSubscriptionPaymentData(
    subscriptionPaymentHistory,
    restaurantNameById,
    restaurantById,
  );

  // Sheet 7: Restaurants who paid subscription (summary)
  const subPayers = workbook.addWorksheet('Subscription Payers');
  subPayers.columns = [
    { header: 'S.No', key: 'sno', width: 8 },
    { header: 'Restaurant ID', key: 'restaurantId', width: 26 },
    { header: 'Restaurant Name', key: 'restaurantName', width: 30 },
    { header: 'Joining Date', key: 'joinDate', width: 16 },
    { header: 'Times Paid', key: 'timesPaid', width: 12 },
    { header: 'Manual Payments', key: 'manualPayments', width: 16 },
    { header: 'Auto Deduct Payments', key: 'autoDeductPayments', width: 20 },
    { header: 'Total Paid (INR)', key: 'totalPaid', width: 16 },
    { header: 'First Payment (IST)', key: 'firstPaymentDate', width: 22 },
    { header: 'Last Payment (IST)', key: 'lastPaymentDate', width: 22 },
    { header: 'Current Plan', key: 'subscriptionPlan', width: 14 },
    { header: 'Current Status', key: 'subscriptionStatus', width: 14 },
    { header: 'Current Due (INR)', key: 'currentDue', width: 16 },
    { header: 'Paid On Record (INR)', key: 'currentPaidOnRecord', width: 18 },
  ];
  styleHeaderRow(subPayers);

  payerSummaries.forEach((row, idx) => {
    subPayers.addRow({ sno: idx + 1, ...row });
  });
  autoFitColumns(subPayers);

  // Sheet 8: Each subscription payment per cycle (detail)
  const subPaymentDetail = workbook.addWorksheet('Subscription Payment Detail');
  subPaymentDetail.columns = [
    { header: 'Restaurant ID', key: 'restaurantId', width: 26 },
    { header: 'Restaurant Name', key: 'restaurantName', width: 30 },
    { header: 'Cycle #', key: 'cycleNumber', width: 10 },
    { header: 'Cycle Label', key: 'cycleLabel', width: 20 },
    { header: 'Payment Date (IST)', key: 'paymentDateIst', width: 22 },
    { header: 'Amount Paid (INR)', key: 'amount', width: 16 },
    { header: 'Payment Type', key: 'paymentType', width: 16 },
    { header: 'Payment Method', key: 'paymentMethod', width: 16 },
    { header: 'Plan', key: 'plan', width: 12 },
    { header: 'Cycle Mode', key: 'cycleMode', width: 14 },
    { header: 'Note', key: 'note', width: 40 },
  ];
  styleHeaderRow(subPaymentDetail);

  for (const row of paymentDetails) {
    subPaymentDetail.addRow(row);
  }
  autoFitColumns(subPaymentDetail);

  return workbook;
};

const main = async () => {
  const args = parseArgs();
  const statusFilter = String(args.status || 'all').trim().toLowerCase();

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI / MONGODB_URI missing in Backend/.env');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultOutput = path.join(__dirname, `../reports/restaurant-analytics-${timestamp}.xlsx`);
  const outputPath = path.resolve(args.output || defaultOutput);

  console.log('Connecting to MongoDB (read-only)...');
  await mongoose.connect(mongoUri);

  try {
    console.log('Fetching restaurants...');
    const restaurants = await fetchRestaurants(statusFilter);
    console.log(`Found ${restaurants.length} restaurants (filter: ${statusFilter})`);

    console.log('Fetching orders and computing finance from order data...');
    const [orders, withdrawalMap, subscriptionCycles, subscriptionPaymentHistory] = await Promise.all([
      fetchAllOrders(),
      fetchWithdrawalStats(),
      fetchSubscriptionCycles(),
      fetchSubscriptionPaymentHistory(),
    ]);
    const { lifetimeMap, monthlyMap, orderStatsMap } = buildFinanceFromOrders(orders);
    console.log(`Processed ${orders.length} orders`);

    console.log('Building Excel workbook...');
    const workbook = await buildWorkbook({
      restaurants,
      orderStatsMap,
      lifetimeMap,
      monthlyMap,
      withdrawalMap,
      subscriptionCycles,
      subscriptionPaymentHistory,
      statusFilter,
    });

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await workbook.xlsx.writeFile(outputPath);

    console.log('\n=== EXPORT COMPLETE ===');
    console.log(`File: ${outputPath}`);
    console.log(`Restaurants: ${restaurants.length}`);
    console.log(`Subscription cycles: ${subscriptionCycles.length}`);
    console.log(`Subscription payment events: ${subscriptionPaymentHistory.length}`);
    console.log('Database was NOT modified.');
  } finally {
    await mongoose.connection.close();
  }
};

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
