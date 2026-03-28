const originalText = document.querySelector("#original-text");
const revisedText = document.querySelector("#revised-text");
const originalCount = document.querySelector("#original-count");
const revisedCount = document.querySelector("#revised-count");
const diffOutput = document.querySelector("#diff-output");
const diffSummary = document.querySelector("#diff-summary");
const appShell = document.querySelector(".app-shell");
const originalPanel = document.querySelector(".panel-original");
const standardModeButton = document.querySelector("#mode-standard");
const editModeButton = document.querySelector("#mode-edit");
const reviewModeButton = document.querySelector("#mode-review");
const openHelpButton = document.querySelector("#open-help");
const closeHelpButton = document.querySelector("#close-help");
const helpModal = document.querySelector("#help-modal");
const toggleOriginalLockButton = document.querySelector("#toggle-original-lock");
const toggleOriginalLockLabel = document.querySelector("#toggle-original-lock .panel-action-label");
const copyRevisedTextButton = document.querySelector("#copy-revised-text");
const toggleDiffOnlyButton = document.querySelector("#toggle-diff-only");

let isOriginalLocked = false;
let isDiffOnlyMode = false;

const debounce = (fn, wait = 120) => {
  let timerId = 0;
  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), wait);
  };
};

const normalizeNewlines = (text) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const splitLines = (text) => {
  if (text === "") {
    return [];
  }
  return normalizeNewlines(text).split("\n");
};

const collectStats = (text) => {
  const normalized = normalizeNewlines(text);
  const total = Array.from(normalized.replace(/\n/g, "")).length;

  return {
    total,
  };
};

const formatDelta = (value) => {
  if (value === 0) {
    return "±0";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString("ja-JP")}`;
};

const buildDeltaNode = (deltaValue) => {
  if (deltaValue === 0) {
    return null;
  }

  const delta = document.createElement("span");
  delta.className = "panel-count-delta";
  if (deltaValue > 0) {
    delta.classList.add("panel-count-delta-positive");
  } else if (deltaValue < 0) {
    delta.classList.add("panel-count-delta-negative");
  } else {
    delta.classList.add("panel-count-delta-neutral");
  }
  delta.textContent = formatDelta(deltaValue);
  return delta;
};

const renderCount = (target, total, deltaValue = null) => {
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(`${total.toLocaleString("ja-JP")}文字`));

  if (deltaValue !== null) {
    const deltaNode = buildDeltaNode(deltaValue);
    if (deltaNode) {
      fragment.append(deltaNode);
    }
  }

  target.replaceChildren(fragment);
};

const buildLcsTable = (before, after) => {
  const table = Array.from({ length: before.length + 1 }, () =>
    new Array(after.length + 1).fill(0),
  );

  for (let i = 1; i <= before.length; i += 1) {
    for (let j = 1; j <= after.length; j += 1) {
      if (before[i - 1] === after[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
};

const diffSequence = (before, after, label = "line") => {
  const table = buildLcsTable(before, after);
  const operations = [];
  let i = before.length;
  let j = after.length;

  while (i > 0 && j > 0) {
    if (before[i - 1] === after[j - 1]) {
      operations.unshift({
        type: "equal",
        value: before[i - 1],
        label,
      });
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      operations.unshift({
        type: "removed",
        value: before[i - 1],
        label,
      });
      i -= 1;
    } else {
      operations.unshift({
        type: "added",
        value: after[j - 1],
        label,
      });
      j -= 1;
    }
  }

  while (i > 0) {
    operations.unshift({
      type: "removed",
      value: before[i - 1],
      label,
    });
    i -= 1;
  }

  while (j > 0) {
    operations.unshift({
      type: "added",
      value: after[j - 1],
      label,
    });
    j -= 1;
  }

  return operations;
};

const diffChars = (before, after) => {
  return diffSequence(Array.from(before), Array.from(after), "char");
};

const buildFamiliarContent = (operations) => {
  const fragment = document.createDocumentFragment();
  let bufferText = "";
  let bufferType = null;

  const flushBuffer = () => {
    if (bufferText === "") {
      return;
    }

    const span = document.createElement("span");
    if (bufferType === "added") {
      span.className = "inline-added";
    } else if (bufferType === "removed") {
      span.className = "inline-removed";
    } else {
      span.className = "inline-neutral";
    }
    span.textContent = bufferText;
    fragment.append(span);
    bufferText = "";
    bufferType = null;
  };

  for (const operation of operations) {
    const nextType = operation.type === "equal" ? "neutral" : operation.type;
    const nextValue = operation.value === "" ? "\u00a0" : operation.value;

    if (bufferType === nextType || bufferType === null) {
      bufferType = nextType;
      bufferText += nextValue;
    } else {
      flushBuffer();
      bufferType = nextType;
      bufferText = nextValue;
    }
  }
  flushBuffer();
  return fragment;
};

const createLineCell = (lineInfo = {}) => {
  const lineCell = document.createElement("div");
  lineCell.className = "diff-line";

  const before = document.createElement("span");
  before.className = "diff-line-before";
  before.textContent = lineInfo.before ?? "";

  const separator = document.createElement("span");
  separator.className = "diff-line-separator";
  separator.textContent = "/";

  const after = document.createElement("span");
  after.className = "diff-line-after";
  after.textContent = lineInfo.after ?? "";

  lineCell.append(before, separator, after);
  return lineCell;
};

const renderDiffRow = ({ variant, content, inlineOperations, lineInfo }) => {
  const row = document.createElement("div");
  row.className = `diff-row diff-row-familiar diff-row-${variant}`;

  const lineCell = createLineCell(lineInfo);
  const textCell = document.createElement("div");
  textCell.className = "diff-text";

  if (inlineOperations) {
    textCell.append(buildFamiliarContent(inlineOperations));
  } else {
    textCell.textContent = content === "" ? "\u00a0" : content;
  }

  row.append(lineCell, textCell);
  return row;
};

const summarizeOperations = (operations) => {
  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];

    if (operation.type === "equal") {
      continue;
    }

    const addedCluster = [];
    const removedCluster = [];

    while (index < operations.length && operations[index].type !== "equal") {
      if (operations[index].type === "added") {
        addedCluster.push(operations[index]);
      }
      if (operations[index].type === "removed") {
        removedCluster.push(operations[index]);
      }
      index += 1;
    }

    index -= 1;

    const paired = Math.min(addedCluster.length, removedCluster.length);
    modifications += paired;
    additions += addedCluster.length - paired;
    deletions += removedCluster.length - paired;
  }

  return { additions, deletions, modifications };
};

const renderSummary = (summary) => {
  const items = [
    { label: "追加", value: `+${summary.additions}行`, tone: "added" },
    { label: "削除", value: `-${summary.deletions}行`, tone: "removed" },
  ];

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const wrapper = document.createElement("div");
    wrapper.className = "summary-item";

    const label = document.createElement("span");
    label.className = "summary-label";
    label.textContent = item.label;

    const value = document.createElement("span");
    value.className = "summary-value";
    if (item.tone === "added") {
      value.classList.add("summary-value-added");
    } else if (item.tone === "removed") {
      value.classList.add("summary-value-removed");
    }
    value.textContent = item.value;

    wrapper.append(label, value);
    fragment.append(wrapper);
  }

  diffSummary.replaceChildren(fragment);
};

const renderFamiliarDiff = (lineOperations) => {
  const fragment = document.createDocumentFragment();
  let beforeLineNumber = 1;
  let afterLineNumber = 1;

  for (let index = 0; index < lineOperations.length; index += 1) {
    const operation = lineOperations[index];

    if (operation.type === "equal") {
      if (isDiffOnlyMode) {
        beforeLineNumber += 1;
        afterLineNumber += 1;
        continue;
      }
      fragment.append(
        renderDiffRow({
          variant: "familiar-context",
          content: operation.value,
          lineInfo: {
            before: beforeLineNumber,
            after: afterLineNumber,
          },
        }),
      );
      beforeLineNumber += 1;
      afterLineNumber += 1;
      continue;
    }

    const removedCluster = [];
    const addedCluster = [];

    while (index < lineOperations.length && lineOperations[index].type !== "equal") {
      const clusterItem = lineOperations[index];
      if (clusterItem.type === "removed") {
        removedCluster.push(clusterItem.value);
      }
      if (clusterItem.type === "added") {
        addedCluster.push(clusterItem.value);
      }
      index += 1;
    }

    index -= 1;

    const paired = Math.min(removedCluster.length, addedCluster.length);
    for (let pairIndex = 0; pairIndex < paired; pairIndex += 1) {
      fragment.append(
        renderDiffRow({
          variant: "familiar-changed",
          inlineOperations: diffChars(removedCluster[pairIndex], addedCluster[pairIndex]),
          lineInfo: {
            before: beforeLineNumber,
            after: afterLineNumber,
          },
        }),
      );
      beforeLineNumber += 1;
      afterLineNumber += 1;
    }

    for (let removeIndex = paired; removeIndex < removedCluster.length; removeIndex += 1) {
      fragment.append(
        renderDiffRow({
          variant: "familiar-removed",
          inlineOperations: Array.from(removedCluster[removeIndex]).map((value) => ({
            type: "removed",
            value,
          })),
          lineInfo: {
            before: beforeLineNumber,
            after: "",
          },
        }),
      );
      beforeLineNumber += 1;
    }

    for (let addIndex = paired; addIndex < addedCluster.length; addIndex += 1) {
      fragment.append(
        renderDiffRow({
          variant: "familiar-added",
          inlineOperations: Array.from(addedCluster[addIndex]).map((value) => ({
            type: "added",
            value,
          })),
          lineInfo: {
            before: "",
            after: afterLineNumber,
          },
        }),
      );
      afterLineNumber += 1;
    }
  }

  return fragment;
};

const renderEmptyState = () => {
  const wrapper = document.createElement("div");
  wrapper.className = "diff-empty";
  wrapper.textContent =
    "BEFORE と AFTER にテキストを入力すると、ここに差分が表示されます。";
  diffOutput.replaceChildren(wrapper);
  renderSummary({
    additions: 0,
    deletions: 0,
    modifications: 0,
  });
};

const renderDiff = () => {
  const before = splitLines(originalText.value);
  const after = splitLines(revisedText.value);

  if (before.length === 0 && after.length === 0) {
    renderEmptyState();
    return;
  }

  const lineOperations = diffSequence(before, after);
  const summary = summarizeOperations(lineOperations);
  renderSummary(summary);

  if (isDiffOnlyMode && summary.modifications === 0 && summary.additions === 0 && summary.deletions === 0) {
    const wrapper = document.createElement("div");
    wrapper.className = "diff-empty";
    wrapper.textContent = "差分はありません。";
    diffOutput.replaceChildren(wrapper);
    return;
  }

  diffOutput.replaceChildren(renderFamiliarDiff(lineOperations));
};

const refreshCounts = () => {
  const beforeStats = collectStats(originalText.value);
  const afterStats = collectStats(revisedText.value);

  renderCount(originalCount, beforeStats.total);
  renderCount(revisedCount, afterStats.total, afterStats.total - beforeStats.total);
};

const refreshAll = () => {
  refreshCounts();
  renderDiff();
};

const openHelpModal = () => {
  helpModal.hidden = false;
  document.body.style.overflow = "hidden";
  closeHelpButton.focus();
};

const closeHelpModal = () => {
  helpModal.hidden = true;
  document.body.style.overflow = "";
  openHelpButton.focus();
};

const syncOriginalLockState = () => {
  originalText.readOnly = isOriginalLocked;
  originalText.classList.toggle("is-locked", isOriginalLocked);
  toggleOriginalLockButton.classList.toggle("is-active", isOriginalLocked);
  toggleOriginalLockButton.setAttribute("aria-pressed", String(isOriginalLocked));
  toggleOriginalLockLabel.textContent = isOriginalLocked ? "固定中" : "編集を固定";
};

const syncDiffOnlyState = () => {
  toggleDiffOnlyButton.classList.toggle("is-active", isDiffOnlyMode);
  toggleDiffOnlyButton.setAttribute("aria-pressed", String(isDiffOnlyMode));
  toggleDiffOnlyButton.textContent = isDiffOnlyMode ? "全文表示" : "差分だけ表示";
};

const copyRevisedText = async () => {
  const text = revisedText.value;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    revisedText.select();
    document.execCommand("copy");
    revisedText.setSelectionRange(revisedText.value.length, revisedText.value.length);
  }

  copyRevisedTextButton.classList.add("is-success");
  copyRevisedTextButton.textContent = "コピーしました";
  window.setTimeout(() => {
    copyRevisedTextButton.classList.remove("is-success");
    copyRevisedTextButton.textContent = "テキストをコピー";
  }, 1200);
};

const syncOriginalPanelReviewState = (isReview) => {
  if (isReview) {
    originalPanel.tabIndex = 0;
    originalPanel.setAttribute("role", "button");
    originalPanel.setAttribute("aria-label", "標準モードで BEFORE テキストを開く");
    return;
  }

  originalPanel.tabIndex = -1;
  originalPanel.removeAttribute("role");
  originalPanel.removeAttribute("aria-label");
};

const setLayoutMode = (mode) => {
  const isStandard = mode === "standard";
  const isEdit = mode === "edit";
  const isReview = mode === "review";

  appShell.dataset.layout = mode;
  standardModeButton.classList.toggle("is-active", isStandard);
  editModeButton.classList.toggle("is-active", isEdit);
  reviewModeButton.classList.toggle("is-active", isReview);
  standardModeButton.setAttribute("aria-selected", String(isStandard));
  editModeButton.setAttribute("aria-selected", String(isEdit));
  reviewModeButton.setAttribute("aria-selected", String(isReview));
  syncOriginalPanelReviewState(isReview);
};

const debouncedRefreshAll = debounce(() => {
  refreshCounts();
  renderDiff();
});

originalText.addEventListener("input", debouncedRefreshAll);
revisedText.addEventListener("input", debouncedRefreshAll);
standardModeButton.addEventListener("click", () => setLayoutMode("standard"));
editModeButton.addEventListener("click", () => setLayoutMode("edit"));
reviewModeButton.addEventListener("click", () => setLayoutMode("review"));
originalPanel.addEventListener("click", () => {
  if (appShell.dataset.layout === "review") {
    setLayoutMode("standard");
  }
});
originalPanel.addEventListener("keydown", (event) => {
  if (appShell.dataset.layout !== "review") {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setLayoutMode("standard");
  }
});
openHelpButton.addEventListener("click", openHelpModal);
closeHelpButton.addEventListener("click", closeHelpModal);
toggleOriginalLockButton.addEventListener("click", () => {
  isOriginalLocked = !isOriginalLocked;
  syncOriginalLockState();
});
copyRevisedTextButton.addEventListener("click", () => {
  copyRevisedText();
});
toggleDiffOnlyButton.addEventListener("click", () => {
  isDiffOnlyMode = !isDiffOnlyMode;
  syncDiffOnlyState();
  renderDiff();
});
helpModal.addEventListener("click", (event) => {
  if (event.target === helpModal) {
    closeHelpModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpModal.hidden) {
    closeHelpModal();
  }
});

syncOriginalLockState();
syncDiffOnlyState();
setLayoutMode("standard");
refreshAll();
