import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SelectMenu from "@/components/ui/SelectMenu";

const options = [
  { value: "ALL", label: "All ownership" },
  { value: "OWNED", label: "Owned by me" },
  { value: "SHARED", label: "Shared with me" },
] as const;

describe("SelectMenu", () => {
  it("selects a matching styled option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectMenu label="Ownership" value="ALL" options={options} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Ownership: All ownership" }));
    expect(screen.getByRole("listbox", { name: "Ownership" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Shared with me" }));
    expect(onChange).toHaveBeenCalledWith("SHARED");
  });

  it("supports arrow-key selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SelectMenu label="Ownership" value="ALL" options={options} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Ownership: All ownership" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("OWNED");
  });
});
