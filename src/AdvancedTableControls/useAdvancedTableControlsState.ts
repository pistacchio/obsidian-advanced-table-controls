import {
  AtcConfiguration,
  AtcConfigurationColumn,
  AtcDataCell,
  AtcDataColumn,
  AtcDataRow,
  Pagination,
  RawTableData,
} from 'src/utils/types';
import { useCallback, useMemo, useState } from 'react';

import {
  makeFormatterForColumn,
  parseNumberFormat,
} from 'src/utils/formatters';
import {
  DEFAULT_BOOL_NO_FORMAT,
  DEFAULT_BOOL_YES_FORMAT,
  DEFAULT_BOOL_YES_INPUT,
  DEFAULT_COLUMNS_TYPE,
  DEFAULT_DATE_FORMAT,
  DEFAULT_DATE_TIME_FORMAT,
  DEFAULT_NUMBER_FORMAT,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGES_SIZE_OPTIONS,
  DEFAULT_TIME_FORMAT,
} from 'src/utils/sharedConstants';
import { extractValue } from 'src/utils/values';
import { getSortingFunction } from 'src/utils/sorting';

import { PaginationOptions } from 'src/components/PaginationView';
import { App, MarkdownView } from 'obsidian';
import { TableManager } from 'src/TableManager';

export function useAdvancedTableControlsState(
  app: App,
  configuration: AtcConfiguration,
  tableData: RawTableData,
) {
  const [sorting, setSorting] = useState<string | null>(
    configuration.sort ?? null,
  );
  const [filtering, setFiltering] = useState<string | null>(
    configuration.filter ?? null,
  );
  const [pagination, setPagination] = useState<Pagination | null>(() => {
    if (configuration.pagination) {
      const pageSize =
        configuration.pagination['page-size'] ?? DEFAULT_PAGE_SIZE;
      const pageSizes =
        configuration.pagination['page-sizes'] ?? DEFAULT_PAGES_SIZE_OPTIONS;
      if (!pageSizes.contains(pageSize)) {
        pageSizes.push(pageSize);
        pageSizes.sort();
      }

      return {
        pageNumber: 1,
        pageSize,
        pageSizes,
      };
    }

    return null;
  });

  const [totalNumberOfUnpaginatedRows, setTotalNumberOfUnpaginatedRows] =
    useState<number>(tableData.rows.length);

  const onChangePagination = useCallback((p: PaginationOptions) => {
    setPagination((pagination) => ({ ...pagination, ...p }) as Pagination);
  }, []);

  const indexedColumns = useMemo<AtcDataColumn[]>(() => {
    const indexedColumns: AtcDataColumn[] = tableData.columns.map(
      (columnName, index) => {
        const name = columnName;
        const columnConfiguration = (configuration.columns?.[name] ??
          {}) as AtcConfigurationColumn;

        const { formatter, ...columnConfigurationData } = columnConfiguration;

        const type = columnConfigurationData.type ?? DEFAULT_COLUMNS_TYPE;

        let dateFormat;
        if (type === 'datetime') {
          dateFormat =
            columnConfiguration['date-format'] ?? DEFAULT_DATE_TIME_FORMAT;
        } else if (type === 'time') {
          dateFormat = DEFAULT_TIME_FORMAT;
        } else {
          dateFormat =
            columnConfiguration['date-format'] ?? DEFAULT_DATE_FORMAT;
        }

        const columnData = {
          ...columnConfigurationData,
          alias: columnConfigurationData.alias || name,
          editable:
            'editable' in columnConfiguration
              ? !!columnConfiguration.editable
              : !!configuration.editable,
          type,
          name,
          index,
          dateFormat,
          numberFormat: parseNumberFormat(
            columnConfiguration['number-format'] ?? '',
            DEFAULT_NUMBER_FORMAT,
          ),
          yesFormat:
            columnConfigurationData['yes-format'] ?? DEFAULT_BOOL_YES_FORMAT,
          noFormat:
            columnConfigurationData['no-format'] ?? DEFAULT_BOOL_NO_FORMAT,
        } as unknown as AtcDataColumn;

        columnData.formatter = makeFormatterForColumn(columnData, formatter);

        return columnData;
      },
    );

    return indexedColumns;
  }, [tableData.columns, configuration.columns]);

  const rows = useMemo<AtcDataRow[]>(() => {
    const dateFormat = configuration['date-format'] ?? DEFAULT_DATE_FORMAT;
    const datetimeFormat =
      configuration['datetime-format'] ?? DEFAULT_DATE_TIME_FORMAT;
    const yesFormat = configuration['yes-format'] ?? DEFAULT_BOOL_YES_INPUT;

    let rows: AtcDataRow[] = [];

    const currentContent =
      app.workspace.getActiveViewOfType(MarkdownView)?.data ?? '';
    const tableManager = new TableManager();
    const rawTableLines = tableManager.readTableLines(currentContent);

    rows = tableData.rows.map((cells, rowIdx) => {
      let orderedCells: AtcDataCell[] = cells.map((cellContent, cellIdx) => {
        const dateFieldFormat = (() => {
          if (indexedColumns[cellIdx].type === 'time') {
            return DEFAULT_TIME_FORMAT;
          } else if (indexedColumns[cellIdx].type === 'datetime') {
            return datetimeFormat;
          }

          return dateFormat;
        })();

        const value = extractValue(
          cellContent,
          indexedColumns[cellIdx],
          dateFieldFormat,
          yesFormat,
        );

        return {
          column: indexedColumns[cellIdx],
          rawValue: rawTableLines?.[rowIdx + 2]?.[cellIdx] ?? '',
          value,
        } as AtcDataCell;
      });

      const allCells = Object.fromEntries(
        orderedCells.map((c) => [c.column.alias, c.value]),
      );

      orderedCells = orderedCells.map((c, idx) => ({
        ...c,
        formattedValue: indexedColumns[idx].formatter(c.value, allCells, {
          app,
          data: { rows, columns: indexedColumns },
        }),
      }));

      return {
        index: rowIdx,
        orderedCells,
        ...allCells,
      } as AtcDataRow;
    });

    // Sorting
    if (sorting) {
      const sortFn = getSortingFunction(sorting, indexedColumns);

      if (sortFn) {
        const sortField = sorting.startsWith('-') ? sorting.slice(1) : sorting;

        rows = rows.sort((a, b) => sortFn(a[sortField], b[sortField]));
      }
    }

    // Filtering
    if (filtering) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const $data = tableData;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      rows = rows.filter(($row) => eval(filtering));
    }

    setTotalNumberOfUnpaginatedRows(rows.length);

    // Pagination
    if (pagination) {
      rows = rows.slice(
        pagination.pageSize! * (pagination.pageNumber! - 1),
        pagination.pageSize! * pagination.pageNumber!,
      );
    }

    return rows;
  }, [
    configuration,
    tableData,
    sorting,
    filtering,
    pagination,
    indexedColumns,
    app,
  ]);

  return {
    indexedColumns,
    rows,

    pagination,
    onChangePagination,
    totalNumberOfUnpaginatedRows,

    filtering,
    setFiltering,

    sorting,
    setSorting,
  };
}
