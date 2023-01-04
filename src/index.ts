import readXlsxFile, { readSheetNames, Row } from 'read-excel-file/node';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { stringify } from 'querystring';

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
      }))
      .filter((p) => p.quantity !== 0);
    products[product.name] = product;
  }
}

function stringToBatchSizeType(info: string): BatchSizeType {
  return {
    'Bedarf *)': BatchSizeType.BEDARF_RESTRICTED,
    Bedarf: BatchSizeType.BEDARF,
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
  for (const orderRow of orderRows) {
    const productName = orderRow[0].toString();
    const orderQuantities = orderRow
      .slice(1)
      .map((cell, i) =>
        cell ? { i, quantity: cell.toString().split('+') } : {}
      )
      .filter((obj) => !isEmpty(obj))
      .flatMap((obj) =>
        obj.quantity.map((val) => ({
          i: obj.i,
          quantity: Number.parseInt(val),
        }))
      );
    orderQuantities.forEach(({ i, quantity }) => {
      orders.push({ product: productName, quantity, deadline: periods[i] });
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
    [SheetNames.auftraege1]: processAuf1Sheet,
    [SheetNames.auftraege2]: processAuf2Sheet,
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
  console.log('unfoldOrderRecursively(order, products)');
  const product = products[order.product];
  console.log(product);
  const productDependencyOrders = [];
  for (let i = 0; i < product.depends.length; i++) {
    const dependency = product.depends[i];
    console.log(dependency);
    const dependencyOrder = {
      ...dependency,
      quantity: order.quantity * dependency.quantity,
      deadline: order.deadline - product.processingTimePerUnit * order.quantity,
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

  productDependencyOrders;

  return productDependencyOrders;
}

async function calculateQuantityPlanning(
  orders: Order[],
  products: Record<string, Partial<Product>>
) {
  console.log(products);
  console.log(orders);
  // unfold orders to include all dependencies
  const unfoldedOrders = [
    ...orders.flatMap((order) => unfoldOrderRecursively(order, products)),
    ...orders,
  ];
  const sortedUnfoldedOrders = unfoldedOrders.sort(
    // sort first by deadline, then by name
    (a, b) => a.deadline - b.deadline || a.product.localeCompare(b.product)
  );
  console.log(sortedUnfoldedOrders);
  return sortedUnfoldedOrders;
}

async function displayOrders(orders: Order[], products: Record<string, Partial<Product>>) {
  // task structure
  // {
  //     id: 'Task 1',
  //     name: 'Redesign website',
  //     start: '2016-12-28',
  //     end: '2016-12-31',
  //     progress: 20,
  //     dependencies: 'Task 2, Task 3'
  // },
  const tasks = orders.map((order) => ({
    id: order.product,
    name: order.product,
    start: new Date().setDate(order.deadline - order.quantity * products[order.product].processingTimePerUnit),
    end: new Date().setDate(order.deadline),
    progress: order.quantity,
  }));
  // @ts-ignore
  console.log(tasks);
}

async function main() {
  await readInputFile();
  const sortedUnfoldedOrders = await calculateQuantityPlanning(orders, products);
  await displayOrders(sortedUnfoldedOrders, products);
}

main();

type Order = {
  product: string;
  quantity: number;
  deadline: number;
};

type Product = {
  name: string;
  batchSizeType: BatchSizeType;
  batchSize: number;
  ressource: Ressource;
  processingTimePerUnit: number;
  depends: Partial<Order>[];
};

enum BatchSizeType {
  BEDARF,
  BEDARF_RESTRICTED,
  MAX,
  FIX,
}

type Ressource = string;
