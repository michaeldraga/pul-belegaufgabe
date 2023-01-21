# Projekt PUL

## How do I run this?

You need to have node, npm and ideally yarn installed. 

Once you've cloned the repository, you first have to run either `npm install` or `yarn`. Aftwards you can either run `npm run start` or `yarn start` to build and run the code that calculates the quantity and production planning or run `npm run dev` or `yarn dev` to run the code in dev mode (will automatically rerun when files change).

Furthermore, you will need to run `npm run serve` or `yarn serve` in order to be able to view the Gantt charts in a browser. You can find the chart for quantity planning at the url given by the serve command and the production planning at that same url with `/produktion` at the end.

If you want to run the calculations and see the charts for the second example you will need to swap the enum values in [line 138](./src/index.ts#L138) and [line 139](./src/index.ts#L139) of [index.ts](./src/index.ts) around so that their numbers **don't** match up with the methods that get assigned to them.
