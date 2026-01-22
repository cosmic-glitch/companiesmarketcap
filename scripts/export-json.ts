import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { DatabaseCompany } from "../lib/types";

const dbPath = path.join(process.cwd(), "data", "companies.db");
const jsonPath = path.join(process.cwd(), "data", "companies.json");

function exportToJson() {
  const db = new Database(dbPath);

  // Get all companies sorted by rank
  const companies = db
    .prepare("SELECT * FROM companies ORDER BY rank ASC")
    .all() as DatabaseCompany[];

  // Get last updated timestamp
  const lastUpdatedRow = db
    .prepare("SELECT last_updated FROM companies ORDER BY last_updated DESC LIMIT 1")
    .get() as { last_updated: string } | undefined;

  db.close();

  const exportData = {
    companies,
    lastUpdated: lastUpdatedRow?.last_updated || null,
    exportedAt: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(exportData, null, 2));
  console.log(`Exported ${companies.length} companies to ${jsonPath}`);
}

exportToJson();
