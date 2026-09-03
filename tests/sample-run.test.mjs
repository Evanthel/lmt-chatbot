import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_RUN, sampleRunContainsCredentials } from "../src/sample-run.js";

test("sample playback fixture is complete and contains no credentials", () => {
  assert.equal(sampleRunContainsCredentials(), false);
  assert.equal(SAMPLE_RUN.steps.length, 5);
  assert.equal(SAMPLE_RUN.case.rag.sources.length, SAMPLE_RUN.case.metrics.retrieved_count);
  assert.equal(SAMPLE_RUN.case.metrics.citation_pass, true);
  assert.equal(SAMPLE_RUN.case.metrics.expected_source_pass, true);
  assert.ok(SAMPLE_RUN.case.standard.reply.length > 0);
  assert.ok(SAMPLE_RUN.case.rag.reply.length > 0);
});

test("sample summary represents the committed 15-question benchmark", () => {
  assert.equal(SAMPLE_RUN.summary.question_count, 15);
  assert.equal(SAMPLE_RUN.summary.citation_pass_rate, 1);
  assert.equal(SAMPLE_RUN.summary.expected_source_pass_rate, 1);
  assert.ok(SAMPLE_RUN.summary.average_rag_latency_ms > 0);
  assert.ok(SAMPLE_RUN.summary.total_cost_usd > 0);
});
