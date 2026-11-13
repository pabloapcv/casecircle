import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Community Insights module", () => {
  it("exports fetchLiveInsights function", async () => {
    const mod = await import("./community-insights.js");
    assert.equal(typeof mod.fetchLiveInsights, "function");
  });

  it("exports fetchUscisOfficialData function", async () => {
    const mod = await import("./community-insights.js");
    assert.equal(typeof mod.fetchUscisOfficialData, "function");
  });
});

describe("USCIS Official Data files", () => {
  it("processing_times.json has verified N-400 data", async () => {
    const fs = await import("node:fs/promises");
    const data = JSON.parse(await fs.readFile("data/uscis_official/processing_times.json", "utf8"));
    
    assert.ok(data.source?.url, "must have source URL");
    assert.ok(data.forms?.["N-400"], "must have N-400 form");
    
    const n400 = data.forms["N-400"];
    assert.equal(n400.medians?.FY21, 11.5, "N-400 FY21 median should be 11.5");
    assert.equal(n400.medians?.FY22, 10.5, "N-400 FY22 median should be 10.5");
    assert.equal(n400.medians?.FY23, 6.0, "N-400 FY23 median should be 6.0");
    assert.equal(n400.medians?.FY24, 5.0, "N-400 FY24 median should be 5.0");
    assert.equal(n400.medians?.FY25, 5.6, "N-400 FY25 median should be 5.6");
    assert.equal(n400.medians?.FY26, 7.4, "N-400 FY26 median should be 7.4");
  });

  it("quarterly_pending.json has verified pending counts", async () => {
    const fs = await import("node:fs/promises");
    const data = JSON.parse(await fs.readFile("data/uscis_official/quarterly_pending.json", "utf8"));
    
    assert.ok(data.source?.url, "must have source URL");
    
    const n400 = data["N-400"];
    assert.ok(n400?.pending?.length >= 2, "N-400 must have at least 2 quarters");
    
    const fy23q4 = n400.pending.find(p => p.quarter === "FY23 Q4");
    const fy26q3 = n400.pending.find(p => p.quarter === "FY26 Q3");
    assert.equal(fy23q4?.count, 400908, "N-400 FY23 Q4 pending should be 400,908");
    assert.equal(fy26q3?.count, 727371, "N-400 FY26 Q3 pending should be 727,371");
    
    const i485 = data["I-485"];
    assert.ok(i485?.pending?.length >= 2, "I-485 must have at least 2 quarters");
    const i485_fy23q4 = i485.pending.find(p => p.quarter === "FY23 Q4");
    const i485_fy26q3 = i485.pending.find(p => p.quarter === "FY26 Q3");
    assert.equal(i485_fy23q4?.count, 915059, "I-485 FY23 Q4 pending should be 915,059");
    assert.equal(i485_fy26q3?.count, 1560290, "I-485 FY26 Q3 pending should be 1,560,290");
    assert.ok(i485_fy26q3.count > i485_fy23q4.count, "I-485 pending must be rising, not declining");
  });

  it("field_offices.json has verified Chicago data", async () => {
    const fs = await import("node:fs/promises");
    const data = JSON.parse(await fs.readFile("data/uscis_official/field_offices.json", "utf8"));
    
    assert.ok(data.source?.url, "must have source URL");
    assert.ok(data.offices?.length >= 1, "must have at least one office");
    
    const chicago = data.offices.find(o => o.name === "Chicago");
    assert.ok(chicago, "must have Chicago office");
    assert.equal(chicago.fy23q4_approvals, 7664, "Chicago FY23 Q4 approvals should be 7,664");
    assert.equal(chicago.fy26q3_approvals, 557, "Chicago FY26 Q3 approvals should be 557");
    assert.equal(chicago.change_pct_approvals, -92.7, "Chicago approvals change should be -92.7%");
    assert.equal(chicago.fy23q4_pending, 12048, "Chicago FY23 Q4 pending should be 12,048");
    assert.equal(chicago.fy26q3_pending, 22685, "Chicago FY26 Q3 pending should be 22,685");
    assert.equal(chicago.change_pct_pending, 88.3, "Chicago pending change should be +88.3%");
  });

  it("all data files have bilingual labels where applicable", async () => {
    const fs = await import("node:fs/promises");
    
    const pt = JSON.parse(await fs.readFile("data/uscis_official/processing_times.json", "utf8"));
    for (const [form, data] of Object.entries(pt.forms || {})) {
      assert.ok(data.label?.en, `${form} must have English label`);
      assert.ok(data.label?.es, `${form} must have Spanish label`);
    }
    
    const fo = JSON.parse(await fs.readFile("data/uscis_official/field_offices.json", "utf8"));
    assert.ok(fo.note?.en, "field_offices must have English note");
    assert.ok(fo.note?.es, "field_offices must have Spanish note");
  });
});
