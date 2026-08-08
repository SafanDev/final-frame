/**
* Small process-local lifecycle state shared by startup, readiness and shutdown.
* It contains no infrastructure handles, which keeps health checks deterministic
* and avoids circular imports between the HTTP and process entry-point layers.
*/
class RuntimeState {
    private ready = false;
    private shuttingDown = false;

    markReady(): void {
        if (!this.shuttingDown) this.ready = true;
    }

    beginShutdown(): boolean {
        if (this.shuttingDown) return false;
        this.shuttingDown = true;
        this.ready = false;
        return true;
    }

    isReady(): boolean {
        return this.ready && !this.shuttingDown;
    }

    isShuttingDown(): boolean {
        return this.shuttingDown;
    }
}

export const runtimeState = new RuntimeState();
