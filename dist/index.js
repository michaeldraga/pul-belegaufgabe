"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = __importStar(require("read-excel-file/node"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
function isString(value) {
    return typeof value === 'string' && value.length > 0;
}
function isEmpty(value) {
    return (value &&
        Object.keys(value).length === 0 &&
        Object.getPrototypeOf(value) === Object.prototype);
}
var SheetNames;
(function (SheetNames) {
    SheetNames["stl"] = "STL";
    SheetNames["plan"] = "Plandaten";
    SheetNames["auftraege1"] = "Kundenauftr\u00E4ge (1)";
    SheetNames["auftraege2"] = "Kundenauftr\u00E4ge (2)";
})(SheetNames || (SheetNames = {}));
const products = {};
const ressources = {};
const orders = [];
function processStlSheet(rows) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('processing stl sheet');
        const componentRow = rows[2];
        const components = componentRow
            .slice(1)
            .map((name) => ({ name: name.toString(), depends: [] }));
        components.forEach((component) => (products[component.name] = component));
        const productRows = rows.slice(4);
        for (const row of productRows) {
            const product = {};
            product.name = row[0].toString();
            product.depends = row
                .slice(1)
                .map((n, i) => ({
                product: components[i].name,
                quantity: Number.parseInt(n.toString()),
            }))
                .filter((p) => p.quantity !== 0);
            products[product.name] = product;
        }
    });
}
function stringToBatchSizeType(info) {
    return {
        'Bedarf *)': BatchSizeType.BEDARF_RESTRICTED,
        Bedarf: BatchSizeType.BEDARF,
        'Fix 60 Stck.': BatchSizeType.FIX,
        'max 50 **)': BatchSizeType.MAX,
    }[info];
}
function stringToBatchSize(info) {
    return {
        'Bedarf *)': -1,
        Bedarf: -1,
        'Fix 60 Stck.': 60,
        'max 50 **)': 50,
    }[info];
}
function processPlanSheet(rows) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('processing plan sheet');
        const componentRows = rows.slice(2);
        for (const componentRow of componentRows) {
            if (componentRow[0] === null)
                break;
            const product = products[componentRow[0].toString()];
            product.batchSizeType = stringToBatchSizeType(componentRow[1].toString());
            product.batchSize = stringToBatchSize(componentRow[1].toString());
            product.ressource =
                ressources[componentRow[2].toString()] ||
                    (ressources[componentRow[2].toString()] = componentRow[2].toString());
            product.processingTimePerUnit = Number.parseFloat(componentRow[3].toString());
        }
    });
}
function processAuf1Sheet(rows) {
    return __awaiter(this, void 0, void 0, function* () {
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
                .map((cell, i) => cell ? { i, quantity: cell.toString().split('+') } : {})
                .filter((obj) => !isEmpty(obj))
                .flatMap((obj) => obj.quantity.map((val) => ({
                i: obj.i,
                quantity: Number.parseInt(val),
            })));
            orderQuantities.forEach(({ i, quantity }) => {
                orders.push({ product: productName, quantity, deadline: periods[i] });
            });
        }
    });
}
function processAuf2Sheet(rows) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('processing auf2 sheet');
        return rows;
    });
}
function processSheet(file, sheetName) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield (0, node_1.default)(file, { sheet: sheetName });
        return {
            [SheetNames.stl]: processStlSheet,
            [SheetNames.plan]: processPlanSheet,
            [SheetNames.auftraege1]: processAuf1Sheet,
            [SheetNames.auftraege2]: processAuf2Sheet,
        }[sheetName](rows);
    });
}
function constructFilePathFromBase(...filePaths) {
    return path_1.default.resolve(...filePaths);
}
function readInputFile() {
    return __awaiter(this, void 0, void 0, function* () {
        const file = yield promises_1.default.readFile(constructFilePathFromBase('input', 'input.xlsx'));
        const sheetNames = yield (0, node_1.readSheetNames)(file);
        const sheets = {};
        for (const sheetName of sheetNames) {
            sheets[sheetName] = yield processSheet(file, sheetName);
        }
    });
}
function unfoldOrderRecursively(order, products) {
    console.log('unfoldOrderRecursively(order, products)');
    const product = products[order.product];
    console.log(product);
    const productDependencyOrders = [];
    for (let i = 0; i < product.depends.length; i++) {
        const dependency = product.depends[i];
        console.log(dependency);
        const dependencyOrder = Object.assign(Object.assign({}, dependency), { quantity: order.quantity * dependency.quantity, deadline: order.deadline - product.processingTimePerUnit * order.quantity });
        const dependencyDependencyOrders = unfoldOrderRecursively(dependencyOrder, products);
        productDependencyOrders.push(dependencyOrder, ...dependencyDependencyOrders);
    }
    productDependencyOrders;
    return productDependencyOrders;
}
function calculateQuantityPlanning(orders, products) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(products);
        console.log(orders);
        // unfold orders to include all dependencies
        const unfoldedOrders = [
            ...orders.flatMap((order) => unfoldOrderRecursively(order, products)),
            ...orders,
        ];
        const sortedUnfoldedOrders = unfoldedOrders.sort(
        // sort first by deadline, then by name
        (a, b) => a.deadline - b.deadline || a.product.localeCompare(b.product));
        console.log(sortedUnfoldedOrders);
        return sortedUnfoldedOrders;
    });
}
function displayOrders(orders, products) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        yield readInputFile();
        const sortedUnfoldedOrders = yield calculateQuantityPlanning(orders, products);
        yield displayOrders(sortedUnfoldedOrders, products);
    });
}
main();
var BatchSizeType;
(function (BatchSizeType) {
    BatchSizeType[BatchSizeType["BEDARF"] = 0] = "BEDARF";
    BatchSizeType[BatchSizeType["BEDARF_RESTRICTED"] = 1] = "BEDARF_RESTRICTED";
    BatchSizeType[BatchSizeType["MAX"] = 2] = "MAX";
    BatchSizeType[BatchSizeType["FIX"] = 3] = "FIX";
})(BatchSizeType || (BatchSizeType = {}));
//# sourceMappingURL=index.js.map