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
import { ASSET_FILE_ACCEPT, formatFileSize, getAssetCategory, validateAssetFile, type AssetCategory } from "@/lib/assets/file-policy";
import { formatRelativeDate } from "@/lib/utils/format";
import { mergeAssetsByFreshness } from "@/lib/workspace/asset-merge-core";
import { invalidateAssetUrl, prefetchAssetUrl, warmAssetPreview } from "@/lib/storage/signed-url-cache";
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
    beginLocalUploadPreview, bindLocalUploadPreview, clearLocalUploadPreview,
  } = useWorkspaceData();
  const { isAssetSidebarOpen, setIsAssetSidebarOpen, setIsCompareMode } = useWorkspaceUI();
  const upload = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const versionInputRef = useRef<HTMLInputElement | null>(null);
  const deletedAssetTombstonesRef = useRef<Map<string, number>>(new Map());
  const lastLocalUploadRef = useRef<{ file: File; stackFileName?: string } | null>(null);
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
    toast.success(asset.version > 1 ? `Version ${asset.version} uploaded and is being prepared.` : "File uploaded and is being prepared.");
  }

  async function processUpload(file: File, stackFileName?: string) {
    if (!project) return;
    const validation = validateAssetFile(file);
    const previewToken = validation.valid ? beginLocalUploadPreview(file, stackFileName) : null;
    lastLocalUploadRef.current = { file, ...(stackFileName ? { stackFileName } : {}) };

    try {
      const asset = await upload.uploadAsset(projectId, file, project.version, stackFileName);
      if (previewToken) bindLocalUploadPreview(previewToken, asset.id);
      applyUploadedAsset(asset);
    } catch (caught) {
      if (previewToken) clearLocalUploadPreview(previewToken);
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
    const attempt = lastLocalUploadRef.current;
    const previewToken = attempt ? beginLocalUploadPreview(attempt.file, attempt.stackFileName) : null;
    try {
      const asset = await upload.retryUpload();
      if (!asset) {
        if (previewToken) clearLocalUploadPreview(previewToken);
        return;
      }
      if (previewToken) bindLocalUploadPreview(previewToken, asset.id);
      applyUploadedAsset(asset);
    } catch {
      if (previewToken) clearLocalUploadPreview(previewToken);
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
      toast.success(nextAssetId ? `Version ${asset.version} selected for review.` : "Final review file cleared.");
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
      className="ff-workspace-assets"
    >

      <input ref={fileInputRef} type="file" className="sr-only" onChange={handleFileChange} accept={ASSET_FILE_ACCEPT} />
      <input ref={versionInputRef} type="file" className="sr-only" onChange={handleVersionChange} accept={ASSET_FILE_ACCEPT} />

      <div className="ff-workspace-panel-head">
        <div className="ff-workspace-panel-title-row">
          <div className="ff-workspace-panel-title-copy"><h2>Files</h2><span>{totalStackCount}</span></div>
          <div className="flex items-center gap-1.5">
            {isOwner && !isLocked ? <Button size="sm" variant="primary" className="ff-workspace-upload-button" onClick={() => fileInputRef.current?.click()} disabled={upload.isUploading}><span aria-hidden="true">＋</span> Upload</Button> : null}
            <Button size="icon" variant="ghost" className="ff-workspace-mobile-close lg:hidden" onClick={() => setIsAssetSidebarOpen(false)} aria-label="Close files panel">×</Button>
          </div>
        </div>
        <div className="ff-workspace-panel-search">
          <label htmlFor="asset-search" className="sr-only">Search project files</label>
          <input id="asset-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a file…" className={`${fieldControlClass} ff-workspace-search-input`} />
          <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((current) => !current)} className={`ff-workspace-filter-button ${showFilters || category !== "all" ? "is-active" : ""}`}>Filter</button>
        </div>
        {showFilters ? (
          <div className="ff-workspace-file-filters" aria-label="Filter files by type">
            {(Object.keys(categoryLabels) as Array<AssetCategory | "all">).map((value) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)} className={`ff-workspace-file-filter ${category === value ? "is-active" : ""}`}>{categoryLabels[value]}</button>)}
          </div>
        ) : null}
      </div>

      <div className="ff-workspace-panel-scroll">
        {stacks.length === 0 ? (
          <EmptyState
            compact
            icon="◇"
            title={totalStackCount === 0 ? "No files yet" : "No matching files"}
            description={totalStackCount === 0 ? (isOwner ? "Upload a file to begin the review." : "No file has been uploaded yet.") : "Change the search or file-type filter."}
            action={totalStackCount === 0 && isOwner && !isLocked ? <Button variant="primary" onClick={() => fileInputRef.current?.click()}>Upload first file</Button> : undefined}
          />
        ) : (
          <ul className="ff-workspace-file-list">
            {stacks.map((stack) => {
              const latest = stack[0];
              const stackIsActive = stack.some((asset) => asset.id === activeAssetId);
              const expanded = expandedStack === latest.stackKey;
              const assetCategory = getAssetCategory(latest);
              return (
                <li key={latest.stackKey} className={`ff-workspace-file-card ${stackIsActive ? "is-active" : ""}`}>
                  <div className="ff-workspace-file-card-main">
                    <button type="button" onMouseEnter={() => { if (latest.processingStatus === "CLEAN") { prefetchAssetUrl(latest.id); warmAssetPreview(latest.id, latest.previewMimeType ?? latest.mimeType, latest.previewFileSize ?? latest.fileSize); } }} onPointerDown={() => { if (latest.processingStatus === "CLEAN") prefetchAssetUrl(latest.id); }} onFocus={() => { if (latest.processingStatus === "CLEAN") { prefetchAssetUrl(latest.id); warmAssetPreview(latest.id, latest.previewMimeType ?? latest.mimeType, latest.previewFileSize ?? latest.fileSize); } }} onClick={() => { setActiveAssetId(latest.id); setIsCompareMode(false); }} className="ff-workspace-file-button">
                      <span className={`ff-workspace-file-icon ${stackIsActive ? "is-active" : ""}`}><AssetFileIcon category={assetCategory} /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{latest.fileName}</span><span className="ff-workspace-file-meta">v{latest.version} · {formatFileSize(latest.fileSize)} · {latest.processingStatus === "CLEAN" ? "Ready" : latest.processingStatus === "REJECTED" ? "Failed" : "Preparing"}</span></span>
                    </button>
                    <button type="button" onClick={() => setExpandedStack(expanded ? null : latest.stackKey)} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} versions of ${latest.fileName}`} className="ff-workspace-file-expand"><span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
                  </div>

                  {expanded ? (
                    <div className="ff-workspace-version-panel">
                      <div className="ff-workspace-version-head">
                        <span className="ff-workspace-version-title">Versions</span>
                        {isOwner && !isLocked ? <div className="ff-workspace-version-head-actions"><button type="button" onClick={() => { setVersionStackName(latest.fileName); versionInputRef.current?.click(); }}>New version</button><button type="button" onClick={() => setRenameAsset(latest)}>Rename</button></div> : null}
                      </div>
                      <ul className="ff-workspace-version-list">
                        {stack.map((asset, index) => (
                          <li key={asset.id} className={`ff-workspace-version-row ${asset.id === activeAssetId ? "is-active" : ""}`}>
                            <button type="button" onMouseEnter={() => { if (asset.processingStatus === "CLEAN") { prefetchAssetUrl(asset.id); warmAssetPreview(asset.id, asset.previewMimeType ?? asset.mimeType, asset.previewFileSize ?? asset.fileSize); } }} onPointerDown={() => { if (asset.processingStatus === "CLEAN") prefetchAssetUrl(asset.id); }} onFocus={() => { if (asset.processingStatus === "CLEAN") { prefetchAssetUrl(asset.id); warmAssetPreview(asset.id, asset.previewMimeType ?? asset.mimeType, asset.previewFileSize ?? asset.fileSize); } }} onClick={() => { setActiveAssetId(asset.id); setIsCompareMode(false); }} className="ff-workspace-version-main"><span>v{asset.version}{index === 0 ? " · Latest" : ""}</span><small>{formatRelativeDate(asset.updatedAt, preferences)} · {formatFileSize(asset.fileSize)} · {asset.processingStatus === "CLEAN" ? "Ready" : asset.processingStatus === "REJECTED" ? "Failed" : "Preparing"}</small></button>
                            {asset.processingStatus === "REJECTED" && isOwner && !isLocked ? <button type="button" onClick={() => void handleRetryProcessing(asset)} disabled={retryingAssetId !== null} className="ff-workspace-version-action is-warning">{retryingAssetId === asset.id ? "Retrying…" : "Retry"}</button> : null}
                            {isOwner && !isLocked && asset.processingStatus === "CLEAN" ? (
                              <button
                                type="button"
                                onClick={() => void handleSelectFinalAsset(asset)}
                                disabled={selectingFinalAssetId !== null}
                                aria-pressed={project?.finalAssetId === asset.id}
                                className={`ff-workspace-version-action ${project?.finalAssetId === asset.id ? "is-final" : ""}`}
                              >
                                {selectingFinalAssetId === asset.id ? "Saving…" : project?.finalAssetId === asset.id ? "Final" : "Set final"}
                              </button>
                            ) : project?.finalAssetId === asset.id ? <span className="ff-workspace-version-final">Final</span> : null}
                            {canDownload && asset.processingStatus === "CLEAN" ? <AssetDownloadButton assetId={asset.id} fileName={asset.fileName} compact /> : null}
                            {isOwner && !isLocked ? <button type="button" onClick={() => setDeleteTarget(asset)} aria-label={`Delete version ${asset.version} of ${asset.fileName}`} className="ff-workspace-version-delete">×</button> : null}
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
      {!upload.stage && upload.error ? <div className="border-t border-white/10 p-4"><InlineAlert tone="error" title="Upload failed" requestId={upload.requestId}>{upload.error}</InlineAlert><div className="ff-workspace-panel-search"><Button variant="primary" size="sm" onClick={handleRetryUpload} disabled={!upload.canRetry} className="flex-1">Retry</Button><Button variant="secondary" size="sm" onClick={upload.resetUpload}>Dismiss</Button></div></div> : null}

      <AssetRenameDialog open={Boolean(renameAsset)} projectId={projectId} asset={renameAsset} expectedVersion={project?.version ?? 1} onClose={() => setRenameAsset(null)} onRenamed={handleRenamed} />
      <AssetDeleteDialog open={Boolean(deleteTarget)} projectId={projectId} asset={deleteTarget} stackSize={deleteTarget ? assetStacks[deleteTarget.stackKey]?.length ?? 1 : 1} expectedVersion={project?.version ?? 1} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
    </aside>
  );
}
