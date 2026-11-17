import { describe, expect, it } from "vitest";
import { makeField, pages, readForm, validate } from "../src/applications/forms/model";

describe("Forms validation and response pages", () => {
  it("requires a positive confirmation for a required checkbox", () => {
    const consent = { ...makeField("checkbox"), label: "I consent", required: true };
    const model = { ...readForm(undefined), fields: [consent] };
    expect(validate(model, {})).toHaveLength(1);
    expect(validate(model, { [consent.id]: false })).toHaveLength(1);
    expect(validate(model, { [consent.id]: true })).toHaveLength(0);
  });

  it("requires at least one selection when a multi-select field is required", () => {
    const choices = { ...makeField("multiselect"), label: "Services", required: true, options: ["Design", "Review"] };
    const model = { ...readForm(undefined), fields: [choices] };
    expect(validate(model, { [choices.id]: [] })).toHaveLength(1);
    expect(validate(model, { [choices.id]: ["Design"] })).toHaveLength(0);
  });

  it("keeps required questions on their own pages for step validation", () => {
    const first = { ...makeField("text"), label: "Your name", required: true };
    const breakField = makeField("pagebreak");
    const second = { ...makeField("email"), label: "Email", required: true };
    const model = { ...readForm(undefined), fields: [first, breakField, second] };
    const formPages = pages(model);
    expect(formPages).toHaveLength(2);
    expect(formPages[0].map((field) => field.id)).toEqual([first.id]);
    expect(formPages[1].map((field) => field.id)).toEqual([second.id]);
    const problems = validate(model, { [first.id]: "Alex" });
    expect(problems.map((problem) => problem.fieldId)).toEqual([second.id]);
  });
});
