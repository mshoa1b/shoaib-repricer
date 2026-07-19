"use client";
import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { saveStageConfiguration } from "../../../../actions";
import * as xlsx from "xlsx";

function getBaseSku(sku: string): string {
  const upper = sku.toUpperCase();
  if (upper.endsWith("-A") || upper.endsWith("-G") || upper.endsWith("-B") || upper.endsWith("-P")) {
    return sku.substring(0, sku.length - 2);
  }
  return sku;
}

function determineGrade(sku: string): string {
  const upperSku = sku.toUpperCase();
  const firstPart = upperSku.split("-")[0] || "";
  if (upperSku.endsWith("-P") || upperSku.includes("PR-") || firstPart.includes("PPR")) return "Premium";
  if (upperSku.endsWith("-A")) return "A Grade";
  if (upperSku.endsWith("-G")) return "G Grade";
  if (upperSku.endsWith("-B")) return "B Grade";
  return "Unknown";
}

interface Item {
  id: string;
  boxId: string;
  productName: string;
  sku: string;
  grade: string;
  quantity: number;
  cp1Price: number;
  cp1Offset: number;
}

interface Box {
  id: string;
  wioName: string;
  wioNumber: string;
  items: Item[];
}

export function StageConfigForm({
  cycleId,
  boxes,
  stageId,
  branchId,
  initialData,
  allExports = [],
  fromCompany,
  toCompany,
  prevBranchDataOverride
}: {
  cycleId: string,
  boxes: Box[],
  stageId: string,
  branchId: string,
  initialData?: any,
  allExports?: any[],
  fromCompany: string,
  toCompany: string,
  prevBranchDataOverride?: Record<string, { price: number; branchId: string; branchName: string }>
}) {
  const initialMarkupConfig = initialData?.markupConfig ? JSON.parse(initialData.markupConfig) : {};
  const initialRowOverrides = useMemo(() => initialMarkupConfig.rowOverrides || {}, [initialMarkupConfig]);

  const [branchName, setBranchName] = useState(initialData?.branchName || "");
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>(
    initialData?.invoiceBoxes?.map((b: any) => b.boxId) || []
  );
  const defaultMode = stageId === "cp4-cp5" ? "separate" : "mixed";
  const [configMode, setConfigMode] = useState(initialData?.configurationMode || defaultMode);

  const [percentageMarkup, setPercentageMarkup] = useState(initialMarkupConfig.percentageMarkup || 0);
  const [flatMarkup, setFlatMarkup] = useState(initialMarkupConfig.flatMarkup || 0);

  const [enableGradeMarkups, setEnableGradeMarkups] = useState(initialMarkupConfig.enableGradeMarkups || false);
  const defaultEctonGrading = stageId === "cp4-cp5";
  const [enableEctonGrading, setEnableEctonGrading] = useState(
    initialMarkupConfig.enableEctonGrading !== undefined 
      ? initialMarkupConfig.enableEctonGrading 
      : defaultEctonGrading
  );
  const [gradeMarkups, setGradeMarkups] = useState<Record<string, number>>(
    initialMarkupConfig.gradeMarkups || { "Premium": 0, "A Grade": 0, "G Grade": 0, "B Grade": 0 }
  );
  const [rowOverrides, setRowOverrides] = useState<Record<string, number>>(initialMarkupConfig.rowOverrides || {});
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(
    branchId === 'new' ? null : branchId
  );
  const [enableDeviceGrouping, setEnableDeviceGrouping] = useState(
    initialMarkupConfig.enableDeviceGrouping !== undefined 
      ? initialMarkupConfig.enableDeviceGrouping 
      : false
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(
    initialData?.updatedAt ? new Date(initialData.updatedAt) : null
  );
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string | null>("productName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!lastSaved) return;
    const updateTime = () => {
      const seconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000);
      if (seconds < 5) setTimeAgo("just now");
      else if (seconds < 60) setTimeAgo(`${seconds} seconds ago`);
      else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)} minutes ago`);
      else if (seconds < 86400) setTimeAgo(`${Math.floor(seconds / 3600)} hours ago`);
      else setTimeAgo(`${Math.floor(seconds / 86400)} days ago`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  const isFirstMount = useRef(true);

  // Auto-Save Effect
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const saveData = async () => {
      if (!branchName && !currentBranchId) return; // Don't auto-save a new branch without a name

      setIsSaving(true);
      try {
        const savedId = await saveStageConfiguration({
          id: currentBranchId || undefined,
          cycleId,
          fromCompany,
          toCompany,
          branchName,
          configurationMode: configMode,
          markupConfig: JSON.stringify({ 
            percentageMarkup, 
            flatMarkup, 
            enableGradeMarkups,
            gradeMarkups,
            rowOverrides,
            enableEctonGrading,
            enableDeviceGrouping
          }),
          boxIds: selectedBoxIds
        });
        setLastSaved(new Date());
        
        if (!currentBranchId) {
          setCurrentBranchId(savedId);
          // Update URL to reflect the new ID
          const newPath = window.location.pathname.replace('/new', `/${savedId}`);
          window.history.replaceState({}, '', newPath);
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    };

    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [
    branchName,
    configMode, 
    percentageMarkup, 
    flatMarkup, 
    enableGradeMarkups, 
    gradeMarkups, 
    rowOverrides, 
    selectedBoxIds,
    cycleId, fromCompany, toCompany, currentBranchId,
    enableEctonGrading,
    enableDeviceGrouping
  ]);
  
  const handleBulkPriceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = xlsx.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = xlsx.utils.sheet_to_json(sheet);

      const newOverrides = { ...rowOverrides };
      rows.forEach(row => {
        const sku = String(row["SKU"] || row["sku"] || "").trim();
        const priceValue = row["Purchase"] || row["purchase"] || row["Price"] || row["price"];
        const price = parseFloat(String(priceValue).replace(/[€,]/g, ''));
        
        if (!sku || isNaN(price)) return;

        // Find which key this SKU belongs to in the current branch
        const itemInBranch = boxes
          .filter(b => selectedBoxIds.includes(b.id))
          .flatMap(b => b.items)
          .find(i => i.sku === sku);

        if (itemInBranch) {
          let key = "";
          if (configMode === "mixed") key = itemInBranch.productName;
          else if (configMode === "separate") key = itemInBranch.sku;
          else if (configMode === "premium-mixed") key = itemInBranch.grade === "Premium" ? itemInBranch.sku : `${itemInBranch.productName}_NON_PREMIUM`;

          if (key) {
            newOverrides[key] = price;
          }
        }
      });
      setRowOverrides(newOverrides);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // reset
  };

  // Box Exclusivity Logic
  const boxesTakenByOtherBranches = useMemo(() => {
    return allExports
      .filter(e => e.fromCompany === fromCompany && e.toCompany === toCompany && e.id !== branchId)
      .flatMap(e => e.invoiceBoxes.map((ib: any) => ib.boxId));
  }, [allExports, fromCompany, toCompany, branchId]);

  const availableBoxes = useMemo(() => {
    return boxes
      .filter(b => !boxesTakenByOtherBranches.includes(b.id))
      .sort((a, b) => a.wioName.localeCompare(b.wioName));
  }, [boxes, boxesTakenByOtherBranches]);

  const getHistoricalPrice = (item: Item, targetStage: string): number => {
    if (targetStage === "CP-2") return item.cp1Price;

    const boxId = item.boxId;

    if (targetStage === "CP-3") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-2" && e.toCompany === "CP-3" && e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!exportRecord) return item.cp1Price;
      return calculatePriceForExport(item, "CP-2", exportRecord);
    }

    if (targetStage === "CP-4") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-3" && e.toCompany === "CP-4" && e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!exportRecord) return getHistoricalPrice(item, "CP-3");
      return calculatePriceForExport(item, "CP-3", exportRecord);
    }

    return item.cp1Price;
  };

  const calculatePriceForExport = (item: Item, baseStage: string, exportRecord: any): number => {
    const config = JSON.parse(exportRecord.markupConfig || "{}");
    const mode = exportRecord.configurationMode;
    
    let key = "";
    if (mode === "mixed") key = item.productName;
    else if (mode === "separate") key = item.sku;
    else if (mode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

    if (config.rowOverrides && config.rowOverrides[key] !== undefined) {
      return config.rowOverrides[key];
    }

    const exportBoxIds = exportRecord.invoiceBoxes.map((ib: any) => ib.boxId);
    const allExportItems = boxes
      .filter(b => exportBoxIds.includes(b.id))
      .flatMap(b => b.items);

    const groupItems = allExportItems.filter(i => {
      let iKey = "";
      if (mode === "mixed") iKey = i.productName;
      else if (mode === "separate") iKey = i.sku;
      else if (mode === "premium-mixed") iKey = i.grade === "Premium" ? i.sku : `${i.productName}_NON_PREMIUM`;
      return iKey === key;
    });

    if (groupItems.length === 0) return getHistoricalPrice(item, baseStage);

    let totalQty = 0;
    let totalPriceSum = 0;
    const gradesInGroup = new Set<string>();

    groupItems.forEach(gi => {
      let giBasePrice = getHistoricalPrice(gi, baseStage);
      if (config.enableEctonGrading) {
        const grade = gi.grade || determineGrade(gi.sku);
        if (grade === "A Grade" || grade === "G Grade" || grade === "B Grade") {
          const baseSku = getBaseSku(gi.sku);
          const peers = allExportItems.filter(p => {
            const pGrade = p.grade || determineGrade(p.sku);
            return getBaseSku(p.sku) === baseSku && (pGrade === "A Grade" || pGrade === "G Grade" || pGrade === "B Grade");
          });
          let originalTotalVal = 0;
          let ectonDenominator = 0;
          peers.forEach(p => {
            const pGrade = p.grade || determineGrade(p.sku);
            originalTotalVal += getHistoricalPrice(p, baseStage) * p.quantity;
            if (pGrade === "A Grade") ectonDenominator += 1.08 * p.quantity;
            else if (pGrade === "G Grade") ectonDenominator += 1.00 * p.quantity;
            else if (pGrade === "B Grade") ectonDenominator += 0.90 * p.quantity;
          });
          if (ectonDenominator > 0) {
            const baselinePrice = originalTotalVal / ectonDenominator;
            if (grade === "A Grade") giBasePrice = baselinePrice * 1.08;
            else if (grade === "G Grade") giBasePrice = baselinePrice * 1.00;
            else if (grade === "B Grade") giBasePrice = baselinePrice * 0.90;
          }
        }
      }
      totalPriceSum += (giBasePrice * gi.quantity);
      totalQty += gi.quantity;
      gradesInGroup.add(gi.grade);
    });

    const avgBasePrice = totalPriceSum / totalQty;
    
    // Apply Grade Splitting Offset ONLY for the stage where it is being sold TO CP-5
    let baseWithOffset = avgBasePrice;
    if (exportRecord.toCompany === "CP-5") {
      const applyOffset = config.enableEctonGrading ? 0 : (item.cp1Offset || 0);
      baseWithOffset += applyOffset;
    }

    let price = (baseWithOffset * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);
    
    if (config.enableGradeMarkups && config.gradeMarkups) {
      const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
      let highestIndex = -1;
      gradesList.forEach((g, idx) => {
        if (gradesInGroup.has(g)) highestIndex = idx;
      });

      if (highestIndex !== -1) {
        for (let i = 0; i <= highestIndex; i++) {
          price += (config.gradeMarkups[gradesList[i]] || 0);
        }
      }
    }

    return Math.round(price);
  };

  const rawItems = useMemo(() => {
    return boxes
      .filter(b => selectedBoxIds.includes(b.id))
      .flatMap(b => b.items);
  }, [boxes, selectedBoxIds]);

  const rawItemsWithEcton = useMemo(() => {
    const itemsWithPrices = rawItems.map(item => ({
      item,
      rawPrice: getHistoricalPrice(item, fromCompany) || 0,
    }));

    if (!enableEctonGrading) {
      return itemsWithPrices.map(x => ({ ...x.item, basePrice: x.rawPrice }));
    }

    const baseSkuStats: Record<string, { originalTotalValue: number; ectonDenominator: number }> = {};
    itemsWithPrices.forEach(({ item, rawPrice }) => {
      const grade = item.grade || determineGrade(item.sku);
      if (grade === "A Grade" || grade === "G Grade" || grade === "B Grade") {
        const baseSku = getBaseSku(item.sku);
        if (!baseSkuStats[baseSku]) {
          baseSkuStats[baseSku] = { originalTotalValue: 0, ectonDenominator: 0 };
        }
        baseSkuStats[baseSku].originalTotalValue += rawPrice * item.quantity;
        if (grade === "A Grade") {
          baseSkuStats[baseSku].ectonDenominator += 1.08 * item.quantity;
        } else if (grade === "G Grade") {
          baseSkuStats[baseSku].ectonDenominator += 1.00 * item.quantity;
        } else if (grade === "B Grade") {
          baseSkuStats[baseSku].ectonDenominator += 0.90 * item.quantity;
        }
      }
    });

    return itemsWithPrices.map(({ item, rawPrice }) => {
      const grade = item.grade || determineGrade(item.sku);
      let basePrice = rawPrice;
      if (grade === "A Grade" || grade === "G Grade" || grade === "B Grade") {
        const baseSku = getBaseSku(item.sku);
        const stats = baseSkuStats[baseSku];
        if (stats && stats.ectonDenominator > 0) {
          const baselinePrice = stats.originalTotalValue / stats.ectonDenominator;
          if (grade === "A Grade") basePrice = baselinePrice * 1.08;
          else if (grade === "G Grade") basePrice = baselinePrice * 1.00;
          else if (grade === "B Grade") basePrice = baselinePrice * 0.90;
        }
      }
      return {
        ...item,
        basePrice,
        cp1Offset: enableEctonGrading ? 0 : item.cp1Offset
      };
    });
  }, [rawItems, enableEctonGrading, fromCompany, allExports, boxes]);

  const aggregatedItems = useMemo(() => {
    const groups: Record<string, { productName: string, sku: string, qty: number, totalPrice: number, originalTotalPrice: number, totalOffset: number, grades: Set<string> }> = {};

    rawItemsWithEcton.forEach(item => {
      let key = "";
      if (configMode === "mixed") key = item.productName;
      else if (configMode === "separate") key = item.sku;
      else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

      if (!groups[key]) {
        groups[key] = { productName: item.productName, sku: item.sku, qty: 0, totalPrice: 0, originalTotalPrice: 0, totalOffset: 0, grades: new Set() };
      }

      const group = groups[key];
      const lastStagePrice = item.basePrice || 0;
      const originalPrice = getHistoricalPrice(item, fromCompany) || 0;
      
      const newQty = group.qty + item.quantity;
      if (newQty > 0) {
        group.totalPrice = (group.totalPrice * group.qty + lastStagePrice * item.quantity) / newQty;
        group.originalTotalPrice = (group.originalTotalPrice * group.qty + originalPrice * item.quantity) / newQty;
        group.totalOffset = (group.totalOffset * group.qty + (item.cp1Offset || 0) * item.quantity) / newQty;
      }
      group.qty = newQty;
      group.grades.add(item.grade);
    });

    return Object.entries(groups).map(([key, data]) => ({
      key,
      ...data,
      avgPrice: data.totalPrice || 0,
      originalAvgPrice: data.originalTotalPrice || 0,
      avgOffset: data.totalOffset || 0
    }));
  }, [rawItemsWithEcton, configMode, fromCompany, allExports, boxes]);

  const prevBranchData = useMemo(() => {
    if (prevBranchDataOverride) return prevBranchDataOverride;
    if (fromCompany !== "CP-4" || toCompany !== "CP-5") return {};

    // 1. Get all other CP-4 -> CP-5 branches, sorted by createdAt descending
    const otherBranches = allExports
      .filter(e => e.fromCompany === "CP-4" && e.toCompany === "CP-5" && e.id !== currentBranchId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const result: Record<string, { price: number; branchId: string; branchName: string }> = {};

    // 2. Map boxes to their items for efficient lookup
    const boxMap = new Map<string, Item[]>();
    boxes.forEach(b => {
      boxMap.set(b.id, b.items);
    });

    // 3. For each branch, get all its items
    const branchItemsMap = new Map<string, Item[]>();
    otherBranches.forEach(branch => {
      const branchBoxIds = branch.invoiceBoxes.map((ib: any) => ib.boxId);
      const items: Item[] = [];
      branchBoxIds.forEach((boxId: string) => {
        const boxItems = boxMap.get(boxId);
        if (boxItems) {
          items.push(...boxItems);
        }
      });
      branchItemsMap.set(branch.id, items);
    });

    // 4. For each unique SKU in the current cycle, find the latest branch that has it
    const allSkus = new Set<string>();
    boxes.forEach(b => b.items.forEach(i => allSkus.add(i.sku)));

    allSkus.forEach(sku => {
      const matchingBranch = otherBranches.find(branch => {
        const items = branchItemsMap.get(branch.id);
        return items?.some(i => i.sku === sku);
      });

      if (matchingBranch) {
        const items = branchItemsMap.get(matchingBranch.id);
        const itemInBranch = items?.find(i => i.sku === sku);
        if (itemInBranch) {
          const price = calculatePriceForExport(itemInBranch, "CP-4", matchingBranch);
          result[sku] = {
            price,
            branchId: matchingBranch.id,
            branchName: matchingBranch.branchName || "Unnamed Branch"
          };
        }
      }
    });

    return result;
  }, [fromCompany, toCompany, allExports, currentBranchId, boxes, prevBranchDataOverride]);

  const getStackedGradeMarkup = (grades: Set<string>): number => {
    if (!enableGradeMarkups) return 0;
    let total = 0;
    const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
    let highestIndex = -1;
    gradesList.forEach((g, idx) => {
      if (grades.has(g)) highestIndex = idx;
    });
    if (highestIndex === -1) return 0;
    for (let i = 0; i <= highestIndex; i++) {
      total += (gradeMarkups[gradesList[i]] || 0);
    }
    return total;
  };

  const calculateRowPrice = (avgBasePrice: number, key: string, avgOffset: number = 0) => {
    if (rowOverrides[key] !== undefined) return rowOverrides[key];
    
    let base = avgBasePrice || 0;
    if (toCompany === "CP-5") {
      base += avgOffset;
    }

    let price = (base * (1 + (percentageMarkup || 0) / 100)) + (flatMarkup || 0);
    if (enableGradeMarkups) {
      const group = aggregatedItems.find(i => i.key === key);
      if (group) {
        price += getStackedGradeMarkup(group.grades);
      }
    }
    return Math.round(price) || 0;
  };

  const displayItems = useMemo(() => {
    let result = [...aggregatedItems].filter(item => 
      item.productName.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase())
    );

    if (sortField) {
      result.sort((a: any, b: any) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // Handle calculated prices if sorting by current stage
        if (sortField === "currentPrice") {
          valA = calculateRowPrice(a.avgPrice, a.key, a.avgOffset);
          valB = calculateRowPrice(b.avgPrice, b.key, b.avgOffset);
        }

        if (sortField === "profitPerUnit") {
          valA = calculateRowPrice(a.avgPrice, a.key, a.avgOffset) - a.avgPrice;
          valB = calculateRowPrice(b.avgPrice, b.key, b.avgOffset) - b.avgPrice;
        }

        if (typeof valA === "string" && typeof valB === "string") {
          if (sortField === "productName" && valA === valB) {
            const customGradeOrder = ["Premium", "A Grade", "G Grade", "B Grade", "Unknown"];
            const getGradeIndex = (item: any) => {
              const grade = item.grades.size === 1 ? (Array.from(item.grades)[0] as string) : determineGrade(item.sku);
              const idx = customGradeOrder.indexOf(grade);
              return idx === -1 ? 99 : idx;
            };
            const gradeIdxA = getGradeIndex(a);
            const gradeIdxB = getGradeIndex(b);
            return sortOrder === "asc" ? gradeIdxA - gradeIdxB : gradeIdxB - gradeIdxA;
          }
          return sortOrder === "asc" 
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }
        return sortOrder === "asc" 
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
    }

    return result;
  }, [aggregatedItems, search, sortField, sortOrder, percentageMarkup, flatMarkup, enableGradeMarkups, gradeMarkups, rowOverrides]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px' }}>{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };



  const groupedDisplayItems = useMemo(() => {
    if (!enableDeviceGrouping || fromCompany !== "CP-4" || toCompany !== "CP-5") {
      return [];
    }
    
    const groupsMap = new Map<string, typeof displayItems>();
    displayItems.forEach(item => {
      const key = item.productName;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(item);
    });

    return Array.from(groupsMap.entries()).map(([productName, items]) => {
      const groupQty = items.reduce((sum, i) => sum + i.qty, 0);
      
      const totalOriginalValue = items.reduce((sum, i) => sum + (i.originalAvgPrice * i.qty), 0);
      const avgOriginalPrice = groupQty > 0 ? totalOriginalValue / groupQty : 0;

      const totalBaseValue = items.reduce((sum, i) => sum + (i.avgPrice * i.qty), 0);
      const avgBasePrice = groupQty > 0 ? totalBaseValue / groupQty : 0;

      const totalOffsetValue = items.reduce((sum, i) => sum + ((i.avgOffset || 0) * i.qty), 0);
      const avgOffset = groupQty > 0 ? totalOffsetValue / groupQty : 0;

      const totalFinalValue = items.reduce((sum, i) => {
        const finalPrice = calculateRowPrice(i.avgPrice, i.key, i.avgOffset);
        return sum + (finalPrice * i.qty);
      }, 0);
      const avgFinalPrice = groupQty > 0 ? totalFinalValue / groupQty : 0;

      let totalPrevValue = 0;
      let prevQty = 0;
      items.forEach(i => {
        if (prevBranchData[i.sku]) {
          totalPrevValue += prevBranchData[i.sku].price * i.qty;
          prevQty += i.qty;
        }
      });
      const avgPrevPrice = prevQty > 0 ? totalPrevValue / prevQty : null;

      return {
        productName,
        totalQty: groupQty,
        avgOriginalPrice,
        avgBasePrice,
        avgOffset,
        avgFinalPrice,
        avgPrevPrice,
        items
      };
    });
  }, [displayItems, enableDeviceGrouping, fromCompany, toCompany, prevBranchData, percentageMarkup, flatMarkup, enableGradeMarkups, gradeMarkups, rowOverrides]);

  const totalQty = aggregatedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalLastStageValue = aggregatedItems.reduce((sum, item) => sum + (item.avgPrice * item.qty), 0);
  const totalValue = aggregatedItems.reduce((sum, item) => sum + (calculateRowPrice(item.avgPrice, item.key, item.avgOffset) * item.qty), 0);
  const totalProfit = aggregatedItems.reduce((sum, item) => sum + ((calculateRowPrice(item.avgPrice, item.key, item.avgOffset) - item.avgPrice) * item.qty), 0);

  const downloadNUBTemplate = () => {
    const data = aggregatedItems
      .map(item => {
        const finalUnitPrice = calculateRowPrice(item.avgPrice, item.key, item.avgOffset);
        const totalPrice = parseFloat((item.qty * finalUnitPrice).toFixed(2));
        
        let itemName = item.productName;
        if (configMode === "separate") {
          itemName = `${item.productName} - ${item.sku}`;
        } else if (configMode === "premium-mixed") {
          itemName = item.key.endsWith("_NON_PREMIUM") ? `${item.productName} (Non-Premium)` : `${item.productName} (Premium)`;
        }

        return {
          "Item Name": itemName,
          "Description": "Used - Mixed Grades",
          "Qty": item.qty,
          "Unit Price": finalUnitPrice,
          "Tax Scheme": "0.00",
          "Total Price": totalPrice
        };
      })
      .sort((a, b) => a["Item Name"].localeCompare(b["Item Name"]));

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Template");
    xlsx.writeFile(wb, `NUB_Template_${branchName || "export"}.xlsx`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '0.5rem' }}>
      <div className="flex justify-between items-center bg-white/5 p-6 rounded-xl border border-white/10">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <h1 className="mb-1" style={{ fontSize: '1.5rem' }}>{fromCompany} &rarr; {toCompany} Branch</h1>
          <div className="flex items-center gap-2 text-xs text-secondary">
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSaving ? 'var(--accent-primary)' : 'var(--accent-success)' }} />
            {isSaving ? "Saving..." : lastSaved ? `All changes saved ${timeAgo}` : "Not saved yet"}
          </div>
          {currentBranchId && (
            <div className="flex items-center gap-2 text-xs text-secondary" style={{ marginTop: '0.5rem' }}>
              <span>Branch ID: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{currentBranchId}</code></span>
              <button 
                type="button" 
                onClick={() => {
                  navigator.clipboard.writeText(currentBranchId);
                  alert("Branch ID copied to clipboard!");
                }}
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: '0.65rem', borderRadius: '4px', cursor: 'pointer', margin: 0 }}
              >
                Copy
              </button>
            </div>
          )}
        </div>
        
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', gap: '4rem' }}>
          <div className="flex flex-col items-center">
            <span className="info-label">Branch Scale</span>
            <span className="info-value" style={{ fontSize: '1.25rem' }}>{totalQty} Units</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="info-label">Branch Profit</span>
            <span className="info-value" style={{ color: 'var(--accent-success)', fontSize: '1.25rem' }}>
              +€{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div style={{ flex: 1.5, display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ padding: '0.6rem 1.5rem', whiteSpace: 'nowrap' }} 
            disabled={selectedBoxIds.length === 0 || !branchName}
            onClick={downloadNUBTemplate}
          >
            NUB Template
          </button>
          <form action="/api/export" method="POST" className="m-0">
            <input type="hidden" name="cycleId" value={cycleId} />
            <input type="hidden" name="fromCompany" value={fromCompany} />
            <input type="hidden" name="toCompany" value={toCompany} />
            <input type="hidden" name="branchName" value={branchName} />
            <input type="hidden" name="boxIds" value={JSON.stringify(selectedBoxIds)} />
            <input type="hidden" name="configMode" value={configMode} />
            <input type="hidden" name="markupConfig" value={JSON.stringify({ 
              percentageMarkup, 
              flatMarkup, 
              enableGradeMarkups, 
              gradeMarkups, 
              rowOverrides,
              enableEctonGrading,
              enableDeviceGrouping
            })} />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 2rem' }} disabled={selectedBoxIds.length === 0 || !branchName}>
              Export CSV
            </button>
          </form>
        </div>
      </div>

      <div className="card glass-card p-6">
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>1</span>
          Branch Definition
        </h3>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ flex: '1' }}>
            <label className="info-label">Branch Name</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="e.g. Premium Grade Branch or High-Volume Mix"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: '1' }}>
            <label className="info-label">Selling Method</label>
            <select
              className="input-field w-full"
              value={configMode}
              onChange={(e) => setConfigMode(e.target.value)}
            >
              <option value="mixed">Mixed Grades (Grouped by Name)</option>
              <option value="separate">All Separate (Individual SKUs)</option>
              <option value="premium-mixed">Premium by SKU / Others Mixed</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card glass-card p-6">
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>2</span>
          Markup Strategy
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '120px' }}>
            <label className="info-label">Percentage (%)</label>
            <input
              type="number"
              className="input-field w-full"
              placeholder="0"
              value={percentageMarkup || ""}
              onChange={(e) => setPercentageMarkup(Number(e.target.value))}
            />
          </div>

          <div style={{ flex: '1', minWidth: '120px' }}>
            <label className="info-label">Flat Amount (€)</label>
            <input
              type="number"
              className="input-field w-full"
              placeholder="0"
              value={flatMarkup || ""}
              onChange={(e) => setFlatMarkup(Number(e.target.value))}
            />
          </div>

          <div style={{ flex: '1.5', minWidth: '220px' }}>
            <div 
              className="flex items-center gap-3" 
              onClick={() => setEnableGradeMarkups(!enableGradeMarkups)}
              style={{ cursor: 'pointer', userSelect: 'none', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{
                width: '32px',
                height: '16px',
                background: enableGradeMarkups ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                borderRadius: '16px',
                position: 'relative',
                transition: 'all 0.3s ease'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: enableGradeMarkups ? '18px' : '2px',
                  transition: 'all 0.3s ease'
                }} />
              </div>
              <label className="info-label" style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}>
                Enable Grading Markups
              </label>
            </div>
          </div>

          <div style={{ flex: '1.5', minWidth: '220px' }}>
            <div 
              className="flex items-center gap-3" 
              onClick={() => setEnableEctonGrading(!enableEctonGrading)}
              style={{ cursor: 'pointer', userSelect: 'none', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{
                width: '32px',
                height: '16px',
                background: enableEctonGrading ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                borderRadius: '16px',
                position: 'relative',
                transition: 'all 0.3s ease'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: enableEctonGrading ? '18px' : '2px',
                  transition: 'all 0.3s ease'
                }} />
              </div>
              <label className="info-label" style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}>
                Enable Ecton Grading
              </label>
            </div>
          </div>
        </div>

        {enableGradeMarkups && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem', animation: 'fadeIn 0.3s ease' }}>
            {["Premium", "A Grade", "G Grade", "B Grade"].map(grade => (
              <div key={grade} style={{ flex: 1, minWidth: '150px', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <label className="info-label" style={{ color: 'var(--accent-primary)', marginBottom: '0.25rem', fontSize: '0.65rem' }}>{grade}</label>
                <div className="flex items-center gap-1">
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>+€</span>
                  <input 
                    type="number" 
                    className="input-field w-full" 
                    style={{ background: 'transparent', border: 'none', padding: '0', fontSize: '0.9rem' }}
                    value={gradeMarkups[grade] || ""}
                    onChange={(e) => setGradeMarkups({ ...gradeMarkups, [grade]: Number(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card glass-card p-6">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ margin: 0 }}>
            <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>3</span>
            Box Inventory Assignment
          </h3>
          {availableBoxes.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '6px', cursor: 'pointer', margin: 0 }}
                onClick={() => {
                  const availableIds = availableBoxes.map(b => b.id);
                  const newSelected = Array.from(new Set([...selectedBoxIds, ...availableIds]));
                  setSelectedBoxIds(newSelected);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRadius: '6px', cursor: 'pointer', margin: 0 }}
                onClick={() => {
                  const availableIds = availableBoxes.map(b => b.id);
                  setSelectedBoxIds(selectedBoxIds.filter(id => !availableIds.includes(id)));
                }}
              >
                Deselect All
              </button>
            </div>
          )}
        </div>
        {availableBoxes.length === 0 ? (
          <div className="text-center py-8 text-secondary italic">
            All boxes for this stage are already assigned to other branches.
          </div>
        ) : (
          <div className="box-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {availableBoxes.map(box => (
              <div
                key={box.id}
                className={`box-card ${selectedBoxIds.includes(box.id) ? 'selected' : ''}`}
                style={{ padding: '0.75rem' }}
                onClick={() => {
                  if (selectedBoxIds.includes(box.id)) setSelectedBoxIds(selectedBoxIds.filter(id => id !== box.id));
                  else setSelectedBoxIds([...selectedBoxIds, box.id]);
                }}
              >
                <div className="check-indicator" style={{ width: '14px', height: '14px', fontSize: '8px' }}>
                  {selectedBoxIds.includes(box.id) && "✓"}
                </div>
                <div className="wio-num" style={{ fontSize: '0.65rem' }}>{box.wioNumber}</div>
                <div className="wio-name" style={{ fontSize: '0.8rem' }}>{box.wioName}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card glass-card p-0 overflow-hidden mb-20">
        <div className="p-6 border-bottom" style={{ borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary">
            <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>4</span>
            Pricing Preview & Manual Overrides
          </h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {fromCompany === "CP-4" && toCompany === "CP-5" && (
              <div 
                className="flex items-center gap-3" 
                onClick={() => setEnableDeviceGrouping(!enableDeviceGrouping)}
                style={{ cursor: 'pointer', userSelect: 'none', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
              >
                <div style={{
                  width: '32px',
                  height: '16px',
                  background: enableDeviceGrouping ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  position: 'relative',
                  transition: 'all 0.3s ease'
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    background: 'white',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '2px',
                    left: enableDeviceGrouping ? '18px' : '2px',
                    transition: 'all 0.3s ease'
                  }} />
                </div>
                <label style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Enable Device Grouping
                </label>
              </div>
            )}
            <label className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', borderRadius: '8px', cursor: 'pointer', margin: 0 }}>
              Bulk Upload Pricing
              <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleBulkPriceUpload} />
            </label>
            <div style={{ width: '300px' }}>
              <input 
                type="text" 
                className="input-field"
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', fontSize: '0.8rem', width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
              />
            </div>
          </div>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
          <table style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("productName")}>Item Definition <SortIcon field="productName" /></th>
                <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("sku")}>SKU <SortIcon field="sku" /></th>
                <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("qty")}>Qty <SortIcon field="qty" /></th>
                <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("avgPrice")}>Avg Last Stage <SortIcon field="avgPrice" /></th>
                <th className="text-center">Added Value</th>
                {fromCompany === "CP-4" && toCompany === "CP-5" && (
                  <>
                    <th className="text-center">Prev Branch</th>
                    <th style={{ width: '50px' }}></th>
                  </>
                )}
                <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("profitPerUnit")}>Profit <SortIcon field="profitPerUnit" /></th>
                <th className="text-center" style={{ width: '200px', cursor: 'pointer' }} onClick={() => toggleSort("currentPrice")}>Current Stage (€) <SortIcon field="currentPrice" /></th>
              </tr>
            </thead>
            <tbody>
              {enableDeviceGrouping && fromCompany === "CP-4" && toCompany === "CP-5" ? (
                groupedDisplayItems.map(group => {
                  const isExpanded = !!expandedGroups[group.productName];
                  const updatedCount = group.items.filter(i => rowOverrides[i.key] !== undefined && rowOverrides[i.key] !== initialRowOverrides[i.key]).length;
                  const hasUpdatedChildren = updatedCount > 0;
                  const groupProfit = group.items.reduce((sum, i) => {
                    const finalPrice = calculateRowPrice(i.avgPrice, i.key, i.avgOffset);
                    return sum + (finalPrice - i.avgPrice) * i.qty;
                  }, 0);
                  return (
                    <Fragment key={group.productName}>
                      {/* Parent Group Row */}
                      <tr 
                        style={{ 
                          cursor: 'pointer', 
                          background: hasUpdatedChildren ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.05)', 
                          fontWeight: 600 
                        }}
                        onClick={() => setExpandedGroups(prev => ({ ...prev, [group.productName]: !prev[group.productName] }))}
                      >
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ marginRight: '8px', color: 'var(--accent-primary)', display: 'inline-block', width: '12px' }}>
                            {isExpanded ? "▼" : "▶"}
                          </span>
                          <span style={{ color: 'white' }}>{group.productName}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 400 }}>
                            ({group.items.length} {group.items.length === 1 ? 'variant' : 'variants'})
                          </span>
                          {hasUpdatedChildren && (
                            <span style={{ color: 'var(--accent-primary)', fontSize: '0.7rem', marginLeft: '12px', background: 'rgba(59, 130, 246, 0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              ● {updatedCount} updated
                            </span>
                          )}
                        </td>
                        <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                          Grouped
                        </td>
                        <td className="text-center" style={{ fontWeight: 700 }}>{group.totalQty}</td>
                        <td className="font-mono text-center">
                          <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                            €{group.avgOriginalPrice.toFixed(2)}
                          </div>
                          {enableEctonGrading && (group.avgBasePrice !== group.avgOriginalPrice) && (
                            <div style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>
                              &rarr; €{group.avgBasePrice.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="text-center">
                          <span style={{ color: 'var(--accent-primary)', fontSize: '0.85rem' }}>
                            Avg +€{(group.avgFinalPrice - group.avgOriginalPrice).toFixed(2)}
                          </span>
                        </td>
                        {fromCompany === "CP-4" && toCompany === "CP-5" && (
                          <>
                            <td className="text-center font-mono">
                              {group.avgPrevPrice !== null ? (
                                <span className="prev-branch-price">€{group.avgPrevPrice.toFixed(2)}</span>
                              ) : (
                                <span className="text-secondary">—</span>
                              )}
                            </td>
                            <td className="text-center" style={{ padding: '0.25rem' }}>
                              {group.avgPrevPrice !== null && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newOverrides = { ...rowOverrides };
                                    group.items.forEach(i => {
                                      if (prevBranchData[i.sku]) {
                                        newOverrides[i.key] = prevBranchData[i.sku].price;
                                      }
                                    });
                                    setRowOverrides(newOverrides);
                                  }}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: '0.2rem 0.5rem',
                                    fontSize: '0.7rem',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-subtle)',
                                    cursor: 'pointer',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'var(--accent-primary)',
                                    margin: 0
                                  }}
                                  title="Copy previous stage value for all items in this group"
                                >
                                  &rarr; All
                                </button>
                              )}
                            </td>
                          </>
                        )}
                        <td className="text-center" style={{ fontWeight: 700, color: groupProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                          €{groupProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-center" style={{ fontWeight: 700 }}>
                          €{group.avgFinalPrice.toFixed(2)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>(Avg)</span>
                        </td>
                      </tr>
                      {/* Child Rows */}
                      {isExpanded && [...group.items].sort((a, b) => {
                        const customGradeOrder = ["Premium", "A Grade", "G Grade", "B Grade"];
                        const gradeA = a.grades.size === 1 ? Array.from(a.grades)[0] : determineGrade(a.sku);
                        const gradeB = b.grades.size === 1 ? Array.from(b.grades)[0] : determineGrade(b.sku);
                        let idxA = customGradeOrder.indexOf(gradeA);
                        let idxB = customGradeOrder.indexOf(gradeB);
                        if (idxA === -1) idxA = 99;
                        if (idxB === -1) idxB = 99;
                        return idxA - idxB;
                      }).map(item => {
                        const finalPrice = calculateRowPrice(item.avgPrice, item.key, item.avgOffset);
                        
                        // Exceeds premium warning logic
                        let exceedsPremium = false;
                        let premiumGapTooSmall = false;
                        let premiumPrice = 0;
                        let priceDifference = 0;
                        const itemGrade = item.grades.size === 1 ? Array.from(item.grades)[0] : determineGrade(item.sku);
                        if (itemGrade && ["A Grade", "G Grade", "B Grade"].includes(itemGrade)) {
                          const premiumGroups = aggregatedItems.filter(g => {
                            return g.grades.has("Premium") && g.productName === item.productName;
                          });
                          let minPremiumPrice = Infinity;
                          let hasPremium = false;
                          premiumGroups.forEach(g => {
                            const pPrice = calculateRowPrice(g.avgPrice, g.key, g.avgOffset);
                            if (pPrice < minPremiumPrice) {
                              minPremiumPrice = pPrice;
                              hasPremium = true;
                            }
                          });
                          if (hasPremium) {
                            premiumPrice = minPremiumPrice;
                            priceDifference = premiumPrice - finalPrice;
                            if (finalPrice > premiumPrice) {
                              exceedsPremium = true;
                            } else if (priceDifference < 5) {
                              premiumGapTooSmall = true;
                            }
                          }
                        }

                        const isUpdated = rowOverrides[item.key] !== undefined && rowOverrides[item.key] !== initialRowOverrides[item.key];

                        return (
                          <tr key={item.key} style={{ background: isUpdated ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0, 0, 0, 0.15)' }}>
                            <td style={{ padding: '0.75rem 1rem 0.75rem 2.5rem' }}>
                              <div style={{ fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <div style={{ fontSize: '0.85rem' }}>
                                  {item.grades.size === 1 ? Array.from(item.grades)[0] : "Variant"}
                                </div>
                                <div className="text-xs text-secondary">
                                  {item.productName}
                                </div>
                              </div>
                            </td>
                            <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                              {configMode === "mixed" ? "MIXED" : item.sku}
                            </td>
                            <td className="text-center" style={{ fontWeight: 500 }}>{item.qty}</td>
                            <td className="font-mono text-center">
                              <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                €{item.originalAvgPrice.toFixed(2)}
                              </div>
                              {enableEctonGrading && (item.avgPrice !== item.originalAvgPrice) && (
                                <div style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>
                                  &rarr; €{item.avgPrice.toFixed(2)}
                                </div>
                              )}
                            </td>
                            <td className="text-center">
                              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>
                                {rowOverrides[item.key] !== undefined ? (
                                  <span style={{ color: 'var(--accent-primary)' }}>
                                    +€{(rowOverrides[item.key] - item.originalAvgPrice).toFixed(2)} (Manual)
                                  </span>
                                ) : (
                                  <>
                                    {enableEctonGrading && (item.avgPrice - item.originalAvgPrice) !== 0 && (
                                      <span style={{ color: (item.avgPrice - item.originalAvgPrice) > 0 ? '#ff8c00' : '#ff5555', fontSize: '0.75rem' }}>
                                        {(item.avgPrice - item.originalAvgPrice) > 0 ? '+' : ''}€{(item.avgPrice - item.originalAvgPrice).toFixed(2)} Ecton Grading
                                      </span>
                                    )}
                                    {(item.avgOffset !== 0 && toCompany === "CP-5") && (
                                      <span style={{ color: item.avgOffset > 0 ? 'var(--accent-primary)' : '#ff5555', fontSize: '0.75rem' }}>
                                        {item.avgOffset > 0 ? '+' : ''}€{item.avgOffset.toFixed(2)} Grade Split
                                      </span>
                                    )}
                                    <span style={{ color: 'var(--accent-primary)' }}>
                                      +€{((item.avgPrice * (percentageMarkup / 100)) + flatMarkup).toFixed(2)} Markup
                                    </span>
                                    {enableGradeMarkups && getStackedGradeMarkup(item.grades) > 0 && (
                                      <span style={{ color: '#ff8c00' }}>+ €{getStackedGradeMarkup(item.grades).toFixed(2)} Stacked</span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                            {fromCompany === "CP-4" && toCompany === "CP-5" && (
                              <>
                                <td className="text-center font-mono" style={{ padding: '0.75rem 1rem' }}>
                                  {prevBranchData[item.sku] ? (
                                    <div className="prev-branch-container">
                                      <span className="prev-branch-price">€{prevBranchData[item.sku].price.toFixed(2)}</span>
                                      <div className="prev-branch-popover">
                                        <a
                                          href={`/dashboard/cycle/${cycleId}/stage/cp4-cp5/${prevBranchData[item.sku].branchId}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="prev-branch-popover-link"
                                        >
                                          View Branch: {prevBranchData[item.sku].branchName} ↗
                                        </a>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-secondary">—</span>
                                  )}
                                </td>
                                <td className="text-center" style={{ padding: '0.75rem 0.5rem', verticalAlign: 'middle' }}>
                                  {prevBranchData[item.sku] && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRowOverrides(prev => ({
                                          ...prev,
                                          [item.key]: prevBranchData[item.sku].price
                                        }));
                                      }}
                                      className="btn btn-secondary"
                                      style={{
                                        padding: '0.2rem 0.4rem',
                                        fontSize: '0.8rem',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-subtle)',
                                        cursor: 'pointer',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--accent-primary)',
                                        transition: 'all 0.2s ease',
                                        margin: 0
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--accent-primary)';
                                        e.currentTarget.style.color = 'white';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                        e.currentTarget.style.color = 'var(--accent-primary)';
                                      }}
                                      title="Copy previous stage value to current stage"
                                    >
                                      &rarr;
                                    </button>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="text-center font-mono" style={{ fontWeight: 600, color: (finalPrice - item.avgPrice) * item.qty >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                              €{((finalPrice - item.avgPrice) * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.7 }}>
                                (€{(finalPrice - item.avgPrice).toFixed(2)}/u)
                              </div>
                            </td>
                            <td style={{ padding: '0.5rem' }} className="text-center">
                              <div className="flex flex-col items-center justify-center">
                                <ManualPriceInput
                                  initialValue={finalPrice}
                                  onSave={(val) => setRowOverrides({ ...rowOverrides, [item.key]: val })}
                                />
                                {isUpdated && (
                                  <span style={{ color: 'var(--accent-primary)', fontSize: '0.65rem', fontWeight: 600, marginTop: '4px' }}>
                                    ● Modified
                                  </span>
                                )}
                                {exceedsPremium && (
                                  <div style={{ color: '#ff5555', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                                    ⚠️ Exceeds Premium (€{premiumPrice.toFixed(2)})
                                  </div>
                                )}
                                {premiumGapTooSmall && (
                                  <div style={{ color: '#ff8c00', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                                    ⚠️ Premium Gap &lt; €5 (€{priceDifference.toFixed(2)})
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })
              ) : (
                displayItems.map(item => {
                  const finalPrice = calculateRowPrice(item.avgPrice, item.key, item.avgOffset);

                  // Exceeds premium warning logic
                  let exceedsPremium = false;
                  let premiumGapTooSmall = false;
                  let premiumPrice = 0;
                  let priceDifference = 0;
                  const itemGrade = item.grades.size === 1 ? Array.from(item.grades)[0] : determineGrade(item.sku);
                  if (itemGrade && ["A Grade", "G Grade", "B Grade"].includes(itemGrade)) {
                    const baseSku = getBaseSku(item.sku);
                    const premiumGroups = aggregatedItems.filter(g => {
                      return g.grades.has("Premium") && g.productName === item.productName;
                    });
                    let minPremiumPrice = Infinity;
                    let hasPremium = false;
                    premiumGroups.forEach(g => {
                      const pPrice = calculateRowPrice(g.avgPrice, g.key, g.avgOffset);
                      if (pPrice < minPremiumPrice) {
                        minPremiumPrice = pPrice;
                        hasPremium = true;
                      }
                    });
                    if (hasPremium) {
                      premiumPrice = minPremiumPrice;
                      priceDifference = premiumPrice - finalPrice;
                      if (finalPrice > premiumPrice) {
                        exceedsPremium = true;
                      } else if (priceDifference < 5) {
                        premiumGapTooSmall = true;
                      }
                    }
                  }

                  const isUpdated = rowOverrides[item.key] !== undefined && rowOverrides[item.key] !== initialRowOverrides[item.key];

                  return (
                    <tr key={item.key} style={{ background: isUpdated ? 'rgba(59, 130, 246, 0.08)' : undefined }}>
                      <td className="text-center" style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{item.productName}</div>
                        <div className="text-xs text-secondary">
                          {Array.from(item.grades)
                            .sort((a, b) => {
                              const order = ["Premium", "A Grade", "G Grade", "B Grade"];
                              return order.indexOf(a) - order.indexOf(b);
                            })
                            .join(", ")}
                        </div>
                      </td>
                      <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                        {configMode === "mixed" ? "MIXED" : item.sku}
                      </td>
                      <td className="text-center" style={{ fontWeight: 600 }}>{item.qty}</td>
                      <td className="font-mono text-center">
                        <div className="text-secondary" style={{ fontSize: '0.85rem' }}>
                          €{item.originalAvgPrice.toFixed(2)}
                        </div>
                        {enableEctonGrading && (item.avgPrice !== item.originalAvgPrice) && (
                          <div style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>
                            &rarr; €{item.avgPrice.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>
                          {rowOverrides[item.key] !== undefined ? (
                            <span style={{ color: 'var(--accent-primary)' }}>
                              +€{(rowOverrides[item.key] - item.originalAvgPrice).toFixed(2)} (Manual)
                            </span>
                          ) : (
                            <>
                              {enableEctonGrading && (item.avgPrice - item.originalAvgPrice) !== 0 && (
                                <span style={{ color: (item.avgPrice - item.originalAvgPrice) > 0 ? '#ff8c00' : '#ff5555', fontSize: '0.75rem' }}>
                                  {(item.avgPrice - item.originalAvgPrice) > 0 ? '+' : ''}€{(item.avgPrice - item.originalAvgPrice).toFixed(2)} Ecton Grading
                                </span>
                              )}
                              {(item.avgOffset !== 0 && toCompany === "CP-5") && (
                                <span style={{ color: item.avgOffset > 0 ? 'var(--accent-primary)' : '#ff5555', fontSize: '0.75rem' }}>
                                  {item.avgOffset > 0 ? '+' : ''}€{item.avgOffset.toFixed(2)} Grade Split
                                </span>
                              )}
                              <span style={{ color: 'var(--accent-primary)' }}>
                                +€{((item.avgPrice * (percentageMarkup / 100)) + flatMarkup).toFixed(2)} Markup
                              </span>
                              {enableGradeMarkups && getStackedGradeMarkup(item.grades) > 0 && (
                                <span style={{ color: '#ff8c00' }}>+ €{getStackedGradeMarkup(item.grades).toFixed(2)} Stacked</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      {fromCompany === "CP-4" && toCompany === "CP-5" && (
                        <>
                          <td className="text-center font-mono" style={{ padding: '0.75rem 1rem' }}>
                            {prevBranchData[item.sku] ? (
                              <div className="prev-branch-container">
                                <span className="prev-branch-price">€{prevBranchData[item.sku].price.toFixed(2)}</span>
                                <div className="prev-branch-popover">
                                  <a
                                    href={`/dashboard/cycle/${cycleId}/stage/cp4-cp5/${prevBranchData[item.sku].branchId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="prev-branch-popover-link"
                                  >
                                    View Branch: {prevBranchData[item.sku].branchName} ↗
                                  </a>
                                </div>
                              </div>
                            ) : (
                              <span className="text-secondary">—</span>
                            )}
                          </td>
                          <td className="text-center" style={{ padding: '0.75rem 0.5rem', verticalAlign: 'middle' }}>
                            {prevBranchData[item.sku] && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRowOverrides(prev => ({
                                    ...prev,
                                    [item.key]: prevBranchData[item.sku].price
                                  }));
                                }}
                                className="btn btn-secondary"
                                style={{
                                  padding: '0.2rem 0.4rem',
                                  fontSize: '0.8rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-subtle)',
                                  cursor: 'pointer',
                                  background: 'rgba(255, 255, 255, 0.03)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--accent-primary)',
                                  transition: 'all 0.2s ease',
                                  margin: 0
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--accent-primary)';
                                  e.currentTarget.style.color = 'white';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                  e.currentTarget.style.color = 'var(--accent-primary)';
                                }}
                                title="Copy previous stage value to current stage"
                              >
                                &rarr;
                              </button>
                            )}
                          </td>
                        </>
                      )}
                      <td className="text-center font-mono" style={{ fontWeight: 600, color: (finalPrice - item.avgPrice) * item.qty >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                        €{((finalPrice - item.avgPrice) * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.7 }}>
                          (€{(finalPrice - item.avgPrice).toFixed(2)}/u)
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem' }} className="text-center">
                        <div className="flex flex-col items-center justify-center">
                          <ManualPriceInput
                            initialValue={finalPrice}
                            onSave={(val) => setRowOverrides({ ...rowOverrides, [item.key]: val })}
                          />
                          {isUpdated && (
                            <span style={{ color: 'var(--accent-primary)', fontSize: '0.65rem', fontWeight: 600, marginTop: '4px' }}>
                              ● Modified
                            </span>
                          )}
                          {exceedsPremium && (
                            <div style={{ color: '#ff5555', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                              ⚠️ Exceeds Premium (€{premiumPrice.toFixed(2)})
                            </div>
                          )}
                          {premiumGapTooSmall && (
                            <div style={{ color: '#ff8c00', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                              ⚠️ Premium Gap &lt; €5 (€{priceDifference.toFixed(2)})
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {aggregatedItems.length === 0 ? (
                <tr>
                  <td colSpan={fromCompany === "CP-4" && toCompany === "CP-5" ? 9 : 7} className="text-center py-20 text-secondary">
                    Select source inventory to calculate prices.
                  </td>
                </tr>
              ) : displayItems.length === 0 ? (
                <tr>
                  <td colSpan={fromCompany === "CP-4" && toCompany === "CP-5" ? 9 : 7} className="text-center py-20 text-secondary">
                    No items match your search "{search}".
                  </td>
                </tr>
              ) : null}
            </tbody>
            {aggregatedItems.length > 0 && (
              <tfoot style={{ background: 'rgba(255,255,255,0.05)', fontWeight: 700, borderTop: '2px solid var(--border-subtle)' }}>
                <tr>
                  <td colSpan={2} className="text-right" style={{ padding: '1rem', textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.7 }}>Totals</td>
                  <td className="text-center" style={{ padding: '1rem' }}>{totalQty}</td>
                  <td className="text-center" style={{ padding: '1rem' }}>€{totalLastStageValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="text-center" style={{ padding: '1rem', color: 'var(--accent-primary)' }}>
                    +€{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  {fromCompany === "CP-4" && toCompany === "CP-5" && (
                    <>
                      <td></td>
                      <td></td>
                    </>
                  )}
                  <td className="text-center" style={{ padding: '1rem', color: 'var(--accent-success)' }}>
                    €{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="text-center" style={{ padding: '1rem', fontSize: '1.1rem' }}>€{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper component to fix "weird" input behavior
function ManualPriceInput({ initialValue, onSave }: { initialValue: number, onSave: (val: number) => void }) {
  const [localVal, setLocalVal] = useState((initialValue || 0).toFixed(2));

  // Sync when global changes, but only if not focused
  useEffect(() => {
    setLocalVal((initialValue || 0).toFixed(2));
  }, [initialValue]);

  return (
    <div className="flex justify-center w-full">
      <input
        type="number"
        step="0.01"
        className="table-input font-mono text-center text-lg"
        style={{ width: '150px' }}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={() => {
          const val = parseFloat(localVal);
          if (!isNaN(val)) {
            const formatted = val.toFixed(2);
            setLocalVal(formatted);
            onSave(parseFloat(formatted));
          }
        }}
      />
    </div>
  );
}
