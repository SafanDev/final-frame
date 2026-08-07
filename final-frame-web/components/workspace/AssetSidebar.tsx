"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import AssetDeleteDialog from "@/components/assets/AssetDeleteDialog";
import AssetDownloadButton from "@/components/assets/AssetDownloadButton";
import AssetFileIcon from "@/components/assets/AssetFileIcon";
import AssetRenameDialog from "@/components/assets/AssetRenameDialog";
import AssetUploadStatus from "@/components/assets/AssetUploadStatus";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { fieldControlClass } from "@/components/ui/Field";
import InlineAlert from "@/components/ui/InlineAlert";
import { useWorkspaceData, useWorkspaceUI } from "@/contexts/WorkspaceContext";
import { useUserPreferences } from "@/contexts/UserPreferencesContext";
import { listAssets, retryAssetProcessing } from "@/lib/api/assets";
import { selectFinalAsset } from "@/lib/api/projects";
import { getUserFacingErrorMessage, normalizeApiError } from "@/lib/api/errors";
import type { AssetMutationResponse, DeleteAssetScope, ProjectAsset } from "@/lib/api/types";
import { ASSET_FILE_ACCEPT, formatFileSize, getAssetCategory, type AssetCategory } from "@/lib/assets/file-policy";
import { formatRelativeDate } from "@/lib/utils/format";
import { mergeAssetsByFreshness } from "@/lib/workspace/asset-merge-core";
import { invalidateAssetUrl, prefetchAssetUrl } from "@/lib/storage/signed-url-cache";
import { useFileUpload } from "@/hooks/useFileUpload";

const categoryLabels: Readonly<Record<AssetCategory | "all", string>> = {
  all: "All",
  image: "Images",
  video: "Video",
  document: "Documents",
  code: "Code",
  other: "Other",
};

export default function AssetSidebar() {
  const preferences = useUserPreferences();
  const {
    projectId, project, setProject, isOwner, isLocked, activeAssetId,
    setActiveAssetId, assetStacks, fetchProjectDetails,
  } = useWorkspaceData();
  const { isAssetSidebarOpen, setIsCompareMode } = useWorkspaceUI();
  const upload = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const versionInputRef = useRef<HTMLInputElement | null>(null);
  const deletedAssetTombstonesRef = useRef<Map<string, number>>(new Map());
  const deletedStackTombstonesRef = useRef<Map<string, number>>(new Map());
  const [versionStackName, setVersionStackName] = useState<string | null>(null);
  const [expandedStack, setExpandedStack] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<{ message: string; requestId: string | null } | null>(null);
  const [renameAsset, setRenameAsset] = useState<ProjectAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectAsset | null>(null);
  const [retryingAssetId, setRetryingAssetId] = useState<string | null>(null);
  const [selectingFinalAssetId, setSelectingFinalAssetId] = useState<string | null>(null);

  const stacks = useMemo(() => Object.values(assetStacks)
    .filter((stack) => stack.length > 0)
    .map((stack) => [...stack].sort((left, right) => right.version - left.version))
    .filter((stack) => {
      const latest = stack[0];
      const matchesSearch = latest.fileName.toLowerCase().includes(search.trim().toLowerCase());
      const matchesCategory = category === "all" || getAssetCategory(latest) === category;
      return matchesSearch && matchesCategory;
    })
    .sort((left, right) => right[0].updatedAt.localeCompare(left[0].updatedAt)), [assetStacks, category, search]);

  const totalStackCount = Object.keys(assetStacks).length;
  const hasMoreAssets = project?.pageInfo.assets.hasMore ?? false;
  const canDownload = Boolean(isOwner || project?.isDownloadUnlocked);

  function mergeVisibleAssets(current: ProjectAsset[], incoming: ProjectAsset[]): ProjectAsset[] {
    return mergeAssetsByFreshness(current, incoming, {
      ids: deletedAssetTombstonesRef.current,
      stacks: deletedStackTombstonesRef.current,
    }).sort((left, right) => {
      const fileCompare = left.fileName.localeCompare(right.fileName);
      return fileCompare || right.version - left.version;
    });
  }

  function applyUploadedAsset(asset: AssetMutationResponse) {
    deletedAssetTombstonesRef.current.delete(asset.id);
    setProject((current) => current ? { ...current, version: asset.projectVersion, assets: mergeVisibleAssets(current.assets, [asset]) } : current);
    setActiveAssetId(asset.id);
    setExpandedStack(asset.stackKey);
    setIsCompareMode(false);
    toast.success(asset.version > 1 ? `Version ${asset.version} uploaded and queued for review preparation.` : "File uploaded and queued for secure review preparation.");
    void fetchProjectDetails(true);
  }

  async function processUpload(file: File, stackFileName?: string) {
    try {
      if (!project) return;
      const asset = await upload.uploadAsset(projectId, file, project.version, stackFileName);
      applyUploadedAsset(asset);
    } catch (caught) {
      if (normalizeApiError(caught).kind !== "aborted") {
        // The persistent upload panel contains the detailed recovery message.
      }
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void processUpload(file);
  }

  function handleVersionChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = versionStackName;
    setVersionStackName(null);
    if (file && target) void processUpload(file, target);
  }

  async function handleRetryUpload() {
    try {
      const asset = await upload.retryUpload();
      if (asset) applyUploadedAsset(asset);
    } catch {
      // State and recovery details are managed by the upload hook.
    }
  }

  async function handleRetryProcessing(asset: ProjectAsset) {
    if (!project || retryingAssetId) return;
    setRetryingAssetId(asset.id);
    try {
      const result = await retryAssetProcessing(projectId, asset.id, project.version);
      setProject((current) => current ? { ...current, version: result.projectVersion ?? current.version } : current);
      await fetchProjectDetails(true);
      toast.success("File preparation queued again.");
    } catch (caught) {
      toast.error(getUserFacingErrorMessage(caught, "File preparation could not be retried."));
    } finally {
      setRetryingAssetId(null);
    }
  }

  async function handleSelectFinalAsset(asset: ProjectAsset) {
    if (!project || selectingFinalAssetId || asset.processingStatus !== "CLEAN") return;
    setSelectingFinalAssetId(asset.id);
    try {
      const nextAssetId = project.finalAssetId === asset.id ? null : asset.id;
      const result = await selectFinalAsset(projectId, nextAssetId, project.version);
      setProject((current) => current ? {
        ...current,
        version: result.version,
        finalAssetId: result.finalAssetId ?? null,
      } : current);
      toast.success(nextAssetId ? `Version ${asset.version} selected for Client review.` : "Final review file cleared.");
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      if (normalized.code === "CONFLICT" || normalized.code === "TRANSACTION_CONFLICT") {
        await fetchProjectDetails(true);
      }
      toast.error(getUserFacingErrorMessage(caught, "The final review file could not be changed."));
    } finally {
      setSelectingFinalAssetId(null);
    }
  }

  async function handleLoadMore() {
    const cursor = project?.pageInfo.assets.nextCursor;
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const page = await listAssets(projectId, { cursor, limit: 50 });
      setProject((current) => current ? {
        ...current,
        assets: mergeVisibleAssets(current.assets, page.items),
        pageInfo: { ...current.pageInfo, assets: page.pageInfo },
      } : current);
    } catch (caught) {
      const normalized = normalizeApiError(caught);
      setLoadError({
        message: getUserFacingErrorMessage(caught, "More files could not be loaded."),
        requestId: normalized.requestId,
      });
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleRenamed() {
    await fetchProjectDetails(true);
    toast.success("File stack renamed.");
  }

  async function handleDeleted(scope: DeleteAssetScope, asset: ProjectAsset) {
    const deletedAt = Date.now();
    deletedAssetTombstonesRef.current.set(asset.id, deletedAt);
    if (scope === "stack") {
      deletedStackTombstonesRef.current.set(asset.stackKey, deletedAt);
      for (const candidate of project?.assets ?? []) {
        if (candidate.stackKey === asset.stackKey) deletedAssetTombstonesRef.current.set(candidate.id, deletedAt);
      }
    }

    for (const candidate of project?.assets ?? []) {
      if (candidate.id === asset.id || (scope === "stack" && candidate.stackKey === asset.stackKey)) {
        invalidateAssetUrl(candidate.id);
      }
    }

    setProject((current) => {
      if (!current) return current;
      const remaining = current.assets.filter((candidate) => scope === "stack"
        ? candidate.stackKey !== asset.stackKey
        : candidate.id !== asset.id);
      return { ...current, assets: remaining };
    });

    if (scope === "stack" || activeAssetId === asset.id) {
      const remaining = project?.assets.filter((candidate) => scope === "stack"
        ? candidate.stackKey !== asset.stackKey
        : candidate.id !== asset.id) ?? [];
      setActiveAssetId(remaining[0]?.id ?? null);
      setIsCompareMode(false);
    }

    await fetchProjectDetails(true);
    toast.success(scope === "stack" ? "File stack deleted." : `Version ${asset.version} deleted.`);
  }

  if (!isAssetSidebarOpen) return null;

  return (
    <aside
      aria-label="Project files"
      className="ff-workspace-assets relative flex w-[16.5rem] shrink-0 flex-col max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-[min(19rem,94vw)] max-lg:shadow-[0_20px_55px_rgba(0,0,0,0.55)]"
    >

      <input ref={fileInputRef} type="file" className="sr-only" onChange={handleFileChange} accept={ASSET_FILE_ACCEPT} />
      <input ref={versionInputRef} type="file" className="sr-only" onChange={handleVersionChange} accept={ASSET_FILE_ACCEPT} />

      <div className="border-b border-white/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-white">Files</h2><p className="mt-0.5 text-xs text-zinc-500">{totalStackCount} stack{totalStackCount === 1 ? "" : "s"}</p></div>
          {isOwner && !isLocked ? <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={upload.isUploading}>Upload</Button> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <label htmlFor="asset-search" className="sr-only">Search project files</label>
          <input id="asset-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files" className={`${fieldControlClass} min-h-10 py-0 text-sm`} />
          <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((current) => !current)} className={`min-h-10 shrink-0 rounded-xl border px-3 text-sm font-semibold ${showFilters || category !== "all" ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-zinc-400 hover:bg-white/5"}`}>Filter</button>
        </div>
        {showFilters ? (
          <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-black/20 p-2" aria-label="Filter files by type">
            {(Object.keys(categoryLabels) as Array<AssetCategory | "all">).map((value) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)} className={`min-h-9 rounded-lg px-2 text-xs font-semibold transition ${category === value ? "bg-emerald-400 text-zinc-950" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}>{categoryLabels[value]}</button>)}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {stacks.length === 0 ? (
          <EmptyState
            compact
            icon="◇"
            title={totalStackCount === 0 ? "No files yet" : "No matching files"}
            description={totalStackCount === 0 ? (isOwner ? "Upload a file to begin the review." : "The designer has not uploaded a file yet.") : "Change the search or file-type filter."}
            action={totalStackCount === 0 && isOwner && !isLocked ? <Button variant="primary" onClick={() => fileInputRef.current?.click()}>Upload first file</Button> : undefined}
          />
        ) : (
          <ul className="space-y-1.5">
            {stacks.map((stack) => {
              const latest = stack[0];
              const stackIsActive = stack.some((asset) => asset.id === activeAssetId);
              const expanded = expandedStack === latest.stackKey;
              const assetCategory = getAssetCategory(latest);
              return (
                <li key={latest.stackKey} className={`overflow-hidden rounded-lg border transition ${stackIsActive ? "border-emerald-400/40 bg-emerald-500/[0.05]" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}>
                  <div className="flex items-center gap-1.5 p-1.5">
                    <button type="button" onMouseEnter={() => { if (latest.processingStatus === "CLEAN") prefetchAssetUrl(latest.id); }} onPointerDown={() => { if (latest.processingStatus === "CLEAN") prefetchAssetUrl(latest.id); }} onFocus={() => { if (latest.processingStatus === "CLEAN") prefetchAssetUrl(latest.id); }} onClick={() => { setActiveAssetId(latest.id); setIsCompareMode(false); }} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md p-2 text-left outline-none transition hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${stackIsActive ? "bg-emerald-400 text-zinc-950" : "bg-white/5 text-zinc-400"}`}><AssetFileIcon category={assetCategory} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{latest.fileName}</span><span className="mt-1 block text-xs text-zinc-500">{stack.length} version{stack.length === 1 ? "" : "s"} · {formatFileSize(latest.fileSize)} · {latest.processingStatus === "CLEAN" ? "Ready" : latest.processingStatus === "REJECTED" ? "Needs attention" : "Preparing"}</span></span>
                    </button>
                    <button type="button" onClick={() => setExpandedStack(expanded ? null : latest.stackKey)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} versions of ${latest.fileName}`} className="min-h-11 min-w-11 rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white"><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
                  </div>

                  {expanded ? (
                    <div className="border-t border-white/10 bg-black/20 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2 px-2 py-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Version history</span>
                        {isOwner && !isLocked ? <div className="flex"><button type="button" onClick={() => { setVersionStackName(latest.fileName); versionInputRef.current?.click(); }} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10">New version</button><button type="button" onClick={() => setRenameAsset(latest)} className="min-h-9 rounded-lg px-2 text-xs font-semibold text-zinc-300 hover:bg-white/5">Rename</button></div> : null}
                      </div>
                      <ul className="space-y-1">
                        {stack.map((asset, index) => (
                          <li key={asset.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${asset.id === activeAssetId ? "bg-white/10" : "hover:bg-white/[0.04]"}`}>
                            <button type="button" onMouseEnter={() => { if (asset.processingStatus === "CLEAN") prefetchAssetUrl(asset.id); }} onPointerDown={() => { if (asset.processingStatus === "CLEAN") prefetchAssetUrl(asset.id); }} onFocus={() => { if (asset.processingStatus === "CLEAN") prefetchAssetUrl(asset.id); }} onClick={() => { setActiveAssetId(asset.id); setIsCompareMode(false); }} className="min-h-10 min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><span className="block text-xs font-bold text-white">Version {asset.version}{index === 0 ? " · Latest" : ""}</span><span className="mt-1 block text-xs text-zinc-500">{formatRelativeDate(asset.updatedAt, preferences)} · {formatFileSize(asset.fileSize)} · {asset.processingStatus === "CLEAN" ? "Ready" : asset.processingStatus === "REJECTED" ? "Failed" : "Preparing"}</span></button>
                            {asset.processingStatus === "REJECTED" && isOwner && !isLocked ? <button type="button" onClick={() => void handleRetryProcessing(asset)} disabled={retryingAssetId !== null} className="min-h-10 rounded-lg px-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">{retryingAssetId === asset.id ? "Retrying…" : "Retry"}</button> : null}
                            {isOwner && !isLocked && asset.processingStatus === "CLEAN" ? (
                              <button
                                type="button"
                                onClick={() => void handleSelectFinalAsset(asset)}
                                disabled={selectingFinalAssetId !== null}
                                aria-pressed={project?.finalAssetId === asset.id}
                                className={`min-h-10 rounded-lg px-2 text-xs font-semibold transition disabled:opacity-50 ${project?.finalAssetId === asset.id ? "bg-emerald-400/15 text-emerald-200" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
                              >
                                {selectingFinalAssetId === asset.id ? "Saving…" : project?.finalAssetId === asset.id ? "Final" : "Use as final"}
                              </button>
                            ) : project?.finalAssetId === asset.id ? <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-emerald-200">Final</span> : null}
                            {canDownload && asset.processingStatus === "CLEAN" ? <AssetDownloadButton assetId={asset.id} fileName={asset.fileName} compact /> : null}
                            {isOwner && !isLocked ? <button type="button" onClick={() => setDeleteTarget(asset)} aria-label={`Delete version ${asset.version} of ${asset.fileName}`} className="min-h-10 min-w-10 rounded-lg text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300">×</button> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {loadError ? <InlineAlert tone="error" title="More files could not be loaded" requestId={loadError.requestId} className="mt-3">{loadError.message}</InlineAlert> : null}
        {hasMoreAssets ? <Button variant="secondary" onClick={handleLoadMore} loading={isLoadingMore} loadingLabel="Loading…" className="mt-3 w-full">Load more files</Button> : null}
      </div>

      {upload.stage && upload.fileName ? <AssetUploadStatus fileName={upload.fileName} stage={upload.stage} progress={upload.progress} onCancel={upload.cancelUpload} /> : null}
      {!upload.stage && upload.error ? <div className="border-t border-white/10 p-4"><InlineAlert tone="error" title="Upload failed" requestId={upload.requestId}>{upload.error}</InlineAlert><div className="mt-3 flex gap-2"><Button variant="primary" size="sm" onClick={handleRetryUpload} disabled={!upload.canRetry} className="flex-1">Retry</Button><Button variant="secondary" size="sm" onClick={upload.resetUpload}>Dismiss</Button></div></div> : null}

      <AssetRenameDialog open={Boolean(renameAsset)} projectId={projectId} asset={renameAsset} expectedVersion={project?.version ?? 1} onClose={() => setRenameAsset(null)} onRenamed={handleRenamed} />
      <AssetDeleteDialog open={Boolean(deleteTarget)} projectId={projectId} asset={deleteTarget} stackSize={deleteTarget ? assetStacks[deleteTarget.stackKey]?.length ?? 1 : 1} expectedVersion={project?.version ?? 1} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
    </aside>
  );
}
