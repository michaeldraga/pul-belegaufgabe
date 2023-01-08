import readXlsxFile, { readSheetNames, Row } from 'read-excel-file/node';
import fs from 'fs/promises';
import path from 'path';

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isEmpty(value: unknown): value is {} {
  return (
    value &&
    Object.keys(value).length === 0 &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

enum SheetNames {
  stl = 'STL',
  plan = 'Plandaten',
  auftraege1 = 'Kundenaufträge (1)',
  auftraege2 = 'Kundenaufträge (2)',
}

const products: Record<string, Partial<Product>> = {};
const ressources: Record<string, Partial<Ressource>> = {};
const orders: Order[] = [];

async function processStlSheet(rows: Row[]) {
  console.log('processing stl sheet');
  const componentRow = rows[2];
  const components: Partial<Product>[] = componentRow
    .slice(1)
    .map((name) => ({ name: name.toString(), depends: [] }));
  components.forEach((component) => (products[component.name] = component));
  const productRows = rows.slice(4);
  for (const row of productRows) {
    const product: Partial<Product> = {};
    product.name = row[0].toString();
    product.depends = row
      .slice(1)
      .map<Partial<Order>>((n, i) => ({
        product: components[i].name,
        quantity: Number.parseInt(n.toString()),
        dependedOnBy: product.name,
        ressource: product.ressource,
      }))
      .filter((p) => p.quantity !== 0);
    products[product.name] = product;
  }
}

function stringToBatchSizeType(info: string): BatchSizeType {
  return {
    'Bedarf *)': BatchSizeType.BEDARF_RESTRICTED,
    Bedarf: BatchSizeType.BEDARF_RESTRICTED,
    'Fix 60 Stck.': BatchSizeType.FIX,
    'max 50 **)': BatchSizeType.MAX,
  }[info];
}

function stringToBatchSize(info: string): number {
  return {
    'Bedarf *)': -1,
    Bedarf: -1,
    'Fix 60 Stck.': 60,
    'max 50 **)': 50,
  }[info];
}

async function processPlanSheet(rows: Row[]) {
  console.log('processing plan sheet');
  const componentRows = rows.slice(2);
  for (const componentRow of componentRows) {
    if (componentRow[0] === null) break;
    const product = products[componentRow[0].toString()];
    product.batchSizeType = stringToBatchSizeType(componentRow[1].toString());
    product.batchSize = stringToBatchSize(componentRow[1].toString());
    product.ressource =
      ressources[componentRow[2].toString()] ||
      (ressources[componentRow[2].toString()] = componentRow[2].toString());
    product.processingTimePerUnit = Number.parseFloat(
      componentRow[3].toString()
    );
  }
}

async function processAuf1Sheet(rows: Row[]) {
  console.log('processing auf1 sheet');
  const periodRow = rows[2];
  const periods = periodRow
    .slice(1)
    .map((cell) => (cell ? Number.parseInt(cell.toString()) : 0))
    .filter(Boolean);
  const orderRows = rows.slice(4);
  let orderId = 0;
  for (const orderRow of orderRows) {
    const productName = orderRow[0].toString();
    const orderQuantities = orderRow
      .slice(1)
      .map((cell, i) =>
        cell ? { i, quantity: cell.toString().split('+') } : {}
      )
      .filter((obj) => !isEmpty(obj))
      .flatMap((obj) => {
        products[productName].maximumConcurrentOrders = obj.quantity.length;
        return obj.quantity.map((val) => ({
          i: obj.i,
          quantity: Number.parseInt(val),
        }));
      });
    orderQuantities.forEach(({ i, quantity }) => {
      orders.push({
        product: productName,
        quantity,
        deadline: periods[i],
        start:
          periods[i] - products[productName].processingTimePerUnit * quantity,
        dependedOnBy: '',
        ressource: products[productName].ressource,
        origin: String(orderId),
        productMaximumConcurrentOrders: undefined,
      });
      orderId++;
    });
  }
}

async function processAuf2Sheet(rows: Row[]) {
  console.log('processing auf2 sheet');
  return rows;
}

async function processSheet(file: Buffer, sheetName: string) {
  const rows = await readXlsxFile(file, { sheet: sheetName });
  return {
    [SheetNames.stl]: processStlSheet,
    [SheetNames.plan]: processPlanSheet,
    [SheetNames.auftraege2]: processAuf1Sheet,
    [SheetNames.auftraege1]: processAuf2Sheet,
  }[sheetName](rows);
}

function constructFilePathFromBase(...filePaths: string[]) {
  return path.resolve(...filePaths);
}

async function readInputFile() {
  const file = await fs.readFile(
    constructFilePathFromBase('input', 'input.xlsx')
  );
  const sheetNames = await readSheetNames(file);

  const sheets = {};
  for (const sheetName of sheetNames) {
    sheets[sheetName] = await processSheet(file, sheetName);
  }
}

function unfoldOrderRecursively(
  order: Partial<Order>,
  products: Record<string, Partial<Product>>
) {
  const product = products[order.product];
  const productDependencyOrders = [];
  for (let i = 0; i < product.depends.length; i++) {
    const dependency = product.depends[i];
    const deadline =
      order.deadline - product.processingTimePerUnit * order.quantity;
    const dependencyOrder = {
      ...dependency,
      quantity: order.quantity * dependency.quantity,
      deadline,
      ressource: products[dependency.product].ressource,
      origin: order.origin,
      start:
        deadline -
        products[dependency.product].processingTimePerUnit *
          dependency.quantity *
          order.quantity,
    };
    const dependencyDependencyOrders = unfoldOrderRecursively(
      dependencyOrder,
      products
    );
    productDependencyOrders.push(
      dependencyOrder,
      ...dependencyDependencyOrders
    );
  }

  return productDependencyOrders;
}

function unfoldOrderOneStep(
  order: Partial<Order>,
  products: Record<string, Partial<Product>>
) {
  const product = products[order.product];
  const productDependencyOrders = [];
  for (let i = 0; i < product.depends.length; i++) {
    const dependency = product.depends[i];
    const deadline =
      order.deadline - product.processingTimePerUnit * order.quantity;
    const dependencyOrder = {
      ...dependency,
      quantity: order.quantity * dependency.quantity,
      deadline,
      ressource: products[dependency.product].ressource,
      origin: order.origin,
      start:
        deadline -
        products[dependency.product].processingTimePerUnit *
          dependency.quantity *
          order.quantity,
    };
    productDependencyOrders.push(dependencyOrder);
  }

  // console.log(productDependencyOrders);

  return productDependencyOrders;
}

function calculateProductMaximumConcurrentOrders(
  unfoldedOrders: Order[],
  products: Record<string, Partial<Product>>
) {
  const productMaximumConcurrentOrders = {};
  for (let i = 0; i < unfoldedOrders.length; i++) {
    const order = unfoldedOrders[i];
    const product = products[order.product];
    if (!productMaximumConcurrentOrders[order.product]) {
      productMaximumConcurrentOrders[order.product] = 0;
    }
    let overlappingOrders = 0;
    for (let j = i + 1; j < unfoldedOrders.length; j++) {
      const nextOrder = unfoldedOrders[j];
      if (nextOrder.product !== order.product) {
        break;
      }
      if (
        nextOrder.ressource === order.ressource &&
        ((nextOrder.start < order.deadline && nextOrder.start > order.start) ||
          (nextOrder.deadline < order.deadline &&
            nextOrder.deadline > order.start) ||
          (nextOrder.start === order.start &&
            nextOrder.deadline === order.deadline))
      ) {
        overlappingOrders++;
      }
    }
    if (overlappingOrders > productMaximumConcurrentOrders[order.product]) {
      productMaximumConcurrentOrders[order.product] = overlappingOrders;
    }
  }
  return productMaximumConcurrentOrders;
}

function setMaximumConcurrentOrders(
  unfoldedOrders: Order[],
  products: Record<string, Partial<Product>>
) {
  const productMaximumConcurrentOrders =
    calculateProductMaximumConcurrentOrders(unfoldedOrders, products);
  for (const order of unfoldedOrders) {
    order.productMaximumConcurrentOrders =
      productMaximumConcurrentOrders[order.product];
  }
  return unfoldedOrders;
}

async function calculateQuantityPlanning(
  orders: Order[],
  products: Record<string, Partial<Product>>
) {
  const unfoldedOrders = [
    ...orders.flatMap((order) => unfoldOrderRecursively(order, products)),
    ...orders,
  ];

  // calculate the maximum number of overlapping orders for each product
  // orders are overlapping if they have the same product and ressource and either start or end of one order is between start and end of the other order
  const sortedUnfoldedOrders = unfoldedOrders.sort(
    (a, b) => a.product.localeCompare(b.product) || a.deadline - b.deadline
  );

  // console.log(sortedUnfoldedOrders);

  const unfoldedOrdersWithMaximumConcurrentOrders = setMaximumConcurrentOrders(
    sortedUnfoldedOrders,
    products
  );

  return unfoldedOrdersWithMaximumConcurrentOrders;
}

async function displayOrders(
  orders: Order[],
  products: Record<string, Partial<Product>>
) {
  const tasks = orders.map((order) => ({
    id: order.product,
    name: order.product,
    start: new Date().setDate(
      order.deadline -
        order.quantity * products[order.product].processingTimePerUnit
    ),
    end: new Date().setDate(order.deadline),
    progress: order.quantity,
    dependency: order.dependedOnBy,
    ressource: order.ressource,
    origin: order.origin,
    productMaximumConcurrentOrders: order.productMaximumConcurrentOrders,
  }));
  return tasks;
}

function groupAndSortDouble(objects, groupKey, sortKey1) {
  const map = new Map();

  for (const object of objects) {
    const key = object[groupKey];
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(object);
  }

  for (const [key, value] of map.entries()) {
    value.sort((a, b) => {
      return a[sortKey1] > b[sortKey1] ? 1 : -1;
    });
  }

  return map;
}

function postProcessMax(orders: Order[]) {
  const groupedOrders = groupAndSortDouble(orders, 'product', 'deadline');
  const processedOrders = [];
  for (const [key, value] of groupedOrders.entries()) {
    let origins = [];
    let quantity = 0;
    let firstDeadline = value[0].deadline;
    for (let i = 0; i < value.length; i++) {
      quantity += value[i].quantity;
      if (origins.indexOf(value[i].origin) === -1) {
        origins.push(value[i].origin);
      }
      // console.log(quantity);
      if (quantity > products[key].batchSize) {
        // console.log(quantity);
        processedOrders.push({
          ...value[i],
          quantity: products[key].batchSize,
          deadline: firstDeadline,
          start:
            firstDeadline -
            products[key].processingTimePerUnit * products[key].batchSize,
          origin: origins.join(),
        });
        quantity = quantity - products[key].batchSize;
        firstDeadline = value[i].deadline;
        origins = [value[i].origin];
      }
    }
    if (quantity > 0) {
      processedOrders.push({
        ...value[value.length - 1],
        quantity,
        deadline: firstDeadline,
        start: firstDeadline - products[key].processingTimePerUnit * quantity,
        origin: origins.join(),
      });
    }
  }
  return processedOrders;
}

function postProcessFix(orders: Order[]) {
  // first group order by product and sort by deadline
  // product can only be processed in batches of batchSize
  const groupedOrders = groupAndSortDouble(orders, 'product', 'deadline');
  const processedOrders = [];
  for (const [key, value] of groupedOrders.entries()) {
    let quantity = 0;
    let firstDeadline = value[0].deadline;
    let origins = [];
    for (let i = 0; i < value.length; i++) {
      quantity += value[i].quantity;
      if (origins.indexOf(value[i].origin) === -1) {
        origins.push(value[i].origin);
      }
      if (quantity >= products[key].batchSize) {
        processedOrders.push({
          ...value[i],
          quantity: products[key].batchSize,
          deadline: firstDeadline,
          start:
            firstDeadline -
            products[key].processingTimePerUnit * products[key].batchSize,
          origin: origins.join(),
        });
        quantity = quantity - products[key].batchSize;
        firstDeadline = value[i].deadline;
        origins = [value[i].origin];
      }
    }
    if (quantity > 0) {
      processedOrders.push({
        ...value[value.length - 1],
        quantity: products[key].batchSize,
        deadline: firstDeadline,
        start:
          firstDeadline -
          products[key].processingTimePerUnit *
            quantity *
            products[key].batchSize,
        origin: origins.join(),
      });
    }
  }
  // if orders overlap, reschedule earlier orders before later orders
  // console.log(processedOrders);
  processedOrders.reverse();
  for (let i = 0; i < processedOrders.length; i++) {
    for (let j = i + 1; j < processedOrders.length; j++) {
      if (
        processedOrders[i].ressource === processedOrders[j].ressource &&
        processedOrders[i].product === processedOrders[j].product &&
        processedOrders[i].deadline > processedOrders[j].start
      ) {
        processedOrders[i].deadline = processedOrders[j].start;
        processedOrders[i].start =
          processedOrders[i].deadline -
          products[processedOrders[i].product].processingTimePerUnit *
            processedOrders[i].quantity;
      }
    }
  }
  processedOrders.reverse();
  return processedOrders;
}

function postProcessOrders(orders: Order[]) {
  const processors = {
    [BatchSizeType.MAX]: postProcessMax,
    [BatchSizeType.FIX]: postProcessFix,
    [BatchSizeType.BEDARF_RESTRICTED]: (order) => order,
  };
  const maxOrders = orders.filter(
    (order) => products[order.product].batchSizeType === BatchSizeType.MAX
  );
  const fixOrders = orders.filter(
    (order) => products[order.product].batchSizeType === BatchSizeType.FIX
  );
  const processedMaxOrders = postProcessMax(maxOrders);
  const processedFixOrders = postProcessFix(fixOrders);
  return [
    ...processedMaxOrders,
    ...processedFixOrders,
    ...orders.filter(
      (order) =>
        products[order.product].batchSizeType ===
        BatchSizeType.BEDARF_RESTRICTED
    ),
  ];
}

async function writeTasksToFile(tasks, file) {
  const data = JSON.stringify(tasks);
  try {
    return fs.writeFile(`./public/${file}.json`, data);
  } catch (err) {
    console.error(err);
  }
}

function isOverlapping(order1: Order, order2: Order) {
  return (
    order1.ressource === order2.ressource &&
    ((order1.deadline > order2.start && order1.deadline < order2.deadline) ||
      (order1.start > order2.start && order1.start < order2.deadline) ||
      (order1.start < order2.start && order1.deadline > order2.deadline) ||
      (order1.start === order2.start && order1.deadline === order2.deadline))
  );
}

const ressourceOrder = {
  Montage: 1,
  Vormontage: 2,
  Fräserei: 3,
  Dreherei: 4,
  Stanzerei: 5,
};

function sequenceConcurrentOrders(orders: Order[]) {
  console.log('sequenencencencnecnecnecnenc');
  const ressourceGroups = groupAndSortDouble(orders, 'ressource', 'deadline');
  const plannedOrders = [];
  const ressourceEntries = Array.from(ressourceGroups.entries()).sort(
    (a, b) => {
      return ressourceOrder[a[0]] - ressourceOrder[b[0]];
    }
  );
  console.log(ressourceEntries);
  for (let i = 0; i < ressourceEntries.length; i++) {
    const [key, value] = ressourceEntries[i];
    const sequencedOrders = [];
    // console.log(value);
    let latestOrder = value[value.length - 1];
    sequencedOrders.push(latestOrder);
    for (let i = value.length - 2; i >= 0; i--) {
      // console.log('latestOrder');
      // console.log(latestOrder);
      // console.log('value[i]');
      // console.log(value[i]);
      if (value[i].deadline > latestOrder.start) {
        const newOrder = {
          ...value[i],
          deadline: latestOrder.start,
          start:
            latestOrder.start -
            products[value[i].product].processingTimePerUnit *
              value[i].quantity,
        };
        sequencedOrders.push(newOrder);
        latestOrder = newOrder;
      } else {
        sequencedOrders.push(value[i]);
        latestOrder = value[i];
      }
    }

    for (const order of sequencedOrders) {
      for (let j = i; j < ressourceEntries.length; j++) {
        const [key2, value2] = ressourceEntries[j];
        for (const order2 of value2) {
          if (
            (order2.origin as string).includes(order.origin) &&
            order.product === order2.dependedOnBy
          ) {
            console.log('order');
            console.log(order);
            console.log('order2');
            console.log(order2);
            if (order2.deadline > order.start) {
              console.log('bingo');
              order2.deadline = order.start;
              order2.start =
                order.start -
                products[order2.product].processingTimePerUnit *
                  order2.quantity;
            }
          }
        }
      }
    }

    plannedOrders.push(...sequencedOrders);

    // console.log(sequencedOrders);
    // break;
  }
  return plannedOrders;
}

function multiSort(array: any[], ...criteria: string[]) {
  return array.sort(function (a, b) {
    if (criteria.length === 0) {
      return 0;
    }
    for (const crit of criteria) {
      const [key, direction] = crit.split(':');
      const aVal = a[key];
      const bVal = b[key];
      if (aVal < bVal) {
        return direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return direction === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

function calculateProductionPlanning(
  orders: Order[],
  products: Record<string, Partial<Product>>
): Order[] {
  console.log('orders');
  // sort orders by deadline, if deadline is equal, sort by name
  // const sortedOrders = multiSort(orders, 'deadline:asc', 'product:desc');
  // console.log(sortedOrders);
  // since each ressource can only process one order at a time, we can just
  // iterate over the orders and calculate the end time of each order
  // by subtracting the processing time from the deadline
  const plannedOrders = [];
  const ordersInSequence = sequenceConcurrentOrders(orders);
  // plannedOrders.push(...ordersInSequence);
  // for (let i = 0; i < plannedOrders.length; ) {
  //   // console.log('please help');
  //   // console.log(plannedOrders.slice(i));
  //   // break;
  //   // console.log(unfoldedOrders);
  //   // const postProcessedOrders = postProcessOrders(unfoldedOrders);
  //   const sequencedOrders = sequenceConcurrentOrders(unfoldedOrders);
  //   plannedOrders.push(...sequencedOrders);
  //   i += unfoldedOrders.length || 1;
  // }
  // console.log(plannedOrders);
  return ordersInSequence;
}

function moveEarlyOrdersForward(
  orders: Order[],
  products: Record<string, Partial<Product>>
): Order[] {
  console.log('EEEEEEEEEEEEEEEEEEEEEEEEEAAAAAAAAAAAAAAAAAAAAAAAAAARRRRRRRRRRRRRRRRRRRRRRRRRLLLLLLLLLLLLLLLYYYYYYYYYYYYY');
  const movedOrders = [];
  for (const order of orders) {
    if (order.start < 0) {
      movedOrders.push({
        ...order,
        start: 0,
        deadline: order.deadline - order.start,
      });
    } else {
      // movedOrders.push(order);
    }
  }
  console.log(movedOrders);
  // return movedOrders;
  return [];
}

async function main() {
  await readInputFile();
  const sortedUnfoldedOrders = await calculateQuantityPlanning(
    orders,
    products
  );
  const processedOrders = postProcessOrders(sortedUnfoldedOrders);
  const tasks = await displayOrders(processedOrders, products);
  writeTasksToFile(tasks, 'tasks');
  const unfoldedOrders = await calculateProductionPlanning(
    processedOrders,
    products
  );
  const movedOrders = moveEarlyOrdersForward(unfoldedOrders, products);
  // const processedPlannedOrders = postProcessOrders(unfoldedOrders);
  // sequence all orders that are on the same ressource
  // to do that, we need to group all orders by ressource and sort them by start
  // then we can iterate over the groups and call sequenceConcurrentOrders on them
  // console.log('BOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOONK')
  // const plannedOrders = sequenceConcurrentOrders(processedPlannedOrders);
  // const unfoldedTasks = await displayOrders(unfoldedOrders, products);
  // writeTasksToFile(unfoldedTasks, 'produktion');
}

main();

type Order = {
  dependedOnBy: string;
  product: string;
  quantity: number;
  deadline: number;
  ressource: Ressource;
  origin: string;
  start: number;
  productMaximumConcurrentOrders: number;
};

type Product = {
  name: string;
  batchSizeType: BatchSizeType;
  batchSize: number;
  ressource: Ressource;
  processingTimePerUnit: number;
  depends: Partial<Order>[];
  maximumConcurrentOrders: number;
};

enum BatchSizeType {
  BEDARF,
  BEDARF_RESTRICTED,
  MAX,
  FIX,
}

type Ressource = string;
