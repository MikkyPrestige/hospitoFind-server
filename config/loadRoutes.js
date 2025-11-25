import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadRoutes(app, baseDir = "routes") {
  const routesPath = path.join(__dirname, "..", baseDir);

  const loadFolder = (folderPath) => {
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const fullPath = path.join(folderPath, file);

      // If directory → recurse
      if (fs.lstatSync(fullPath).isDirectory()) {
        loadFolder(fullPath);
        continue;
      }

      // Only load .js files
      if (file.endsWith(".js")) {
       import(pathToFileURL(fullPath).href).then((module) => {
         const route = module.default;
         if (route) {
           app.use("/", route);
           console.log(`Loaded route → ${fullPath}`);
         }
       });
      }
    }
  };

  loadFolder(routesPath);
}
