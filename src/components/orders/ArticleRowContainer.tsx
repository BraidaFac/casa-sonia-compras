"use client";
import React, { useCallback } from "react";
import { ArticleRow } from "./ArticleRow";
import type {
  Article,
  ColorValue,
  PrintColumn,
  SizeAttribute,
  Warehouse,
} from "@/types";
import type { ProductCategory } from "@/types";

interface Props {
  article: Article;
  // Stable handlers from OrderGrid (all wrapped in useCallback)
  updateArticle: (id: string, updated: Article) => void;
  removeArticle: (id: string) => void;
  duplicateArticle: (id: string) => void;
  getPrintValue: (articleId: string, rowId: string, columnId: string) => string;
  updatePrintValue: (
    articleId: string,
    rowId: string,
    columnId: string,
    value: string,
  ) => void;
  refetchAttrs: () => void;
  // Shared config — stable references expected
  allColors: ColorValue[];
  colorBaseOptions: string[];
  sizeAttributes: SizeAttribute[];
  colorAttributeId: number;
  sizeAttributeId: number;
  categories: ProductCategory[];
  printColumns: PrintColumn[];
  onAddPrintColumn: () => void;
  onUpdatePrintColumnHeader: (id: string, header: string) => void;
  onRemovePrintColumn: (id: string) => void;
  selectedWarehouses: Warehouse[];
  missingRequiredKeys: string[];
  isFirstMissingArticle?: boolean;
  orderId?: number;
  readOnly?: boolean;
}

export const ArticleRowContainer = React.memo(function ArticleRowContainer({
  article,
  updateArticle,
  removeArticle,
  duplicateArticle,
  getPrintValue: getPrintValueAll,
  updatePrintValue: updatePrintValueAll,
  refetchAttrs,
  ...rest
}: Props) {
  const { id } = article;

  const onChange = useCallback(
    (updated: Article) => updateArticle(id, updated),
    [id, updateArticle],
  );

  const onRemove = useCallback(
    () => removeArticle(id),
    [id, removeArticle],
  );

  const onDuplicate = useCallback(
    () => duplicateArticle(id),
    [id, duplicateArticle],
  );

  const getPrintValue = useCallback(
    (rowId: string, columnId: string) => getPrintValueAll(id, rowId, columnId),
    [id, getPrintValueAll],
  );

  const onUpdatePrintValue = useCallback(
    (rowId: string, columnId: string, value: string) =>
      updatePrintValueAll(id, rowId, columnId, value),
    [id, updatePrintValueAll],
  );

  const onOpenSizeModal = useCallback(() => refetchAttrs(), [refetchAttrs]);

  return (
    <ArticleRow
      article={article}
      onChange={onChange}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
      getPrintValue={getPrintValue}
      onUpdatePrintValue={onUpdatePrintValue}
      onOpenSizeModal={onOpenSizeModal}
      {...rest}
    />
  );
});
