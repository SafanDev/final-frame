import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";

describe("form fields", () => {
  it("associates labels, hints and errors with text fields", () => {
    const { rerender } = render(
      <TextField label="Project title" hint="Use a clear name" defaultValue="Campaign" />,
    );
    const input = screen.getByRole("textbox", { name: "Project title" });
    expect(input).toHaveAccessibleDescription("Use a clear name");

    rerender(<TextField label="Project title" error="Title is required" />);
    expect(screen.getByRole("textbox", { name: "Project title" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required");
  });

  it("renders accessible text areas and selects", () => {
    render(
      <>
        <TextAreaField label="Description" optional />
        <SelectField label="Status" defaultValue="review">
          <option value="review">In review</option>
        </SelectField>
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("review");
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });
});
