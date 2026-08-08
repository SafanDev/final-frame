import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Dialog from "@/components/ui/Dialog";

describe("Dialog", () => {
  it("renders through a portal, traps focus and closes with Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog
        open
        onClose={onClose}
        title="Delete project"
        description="This action cannot be undone."
        footer={<button type="button">Confirm deletion</button>}
      >
        <button type="button">Cancel</button>
      </Dialog>,
    );

    const dialog = await screen.findByRole("dialog", { name: "Delete project" });
    expect(dialog).toHaveAccessibleDescription("This action cannot be undone.");
    expect(document.body.style.overflow).toBe("hidden");

    await waitFor(() => expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close a busy dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open busy onClose={onClose} title="Uploading">
        <p>Please wait</p>
      </Dialog>,
    );
    await screen.findByRole("dialog", { name: "Uploading" });
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeDisabled();
  });
});
