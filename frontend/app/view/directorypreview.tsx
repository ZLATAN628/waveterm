// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as util from "@/util/util";
import { Table, createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import clsx from "clsx";
import * as jotai from "jotai";
import React from "react";
import { atoms } from "../store/global";

import "./directorypreview.less";

interface DirectoryTableProps {
    data: FileInfo[];
    cwd: string;
    setFileName: (_: string) => void;
}

const columnHelper = createColumnHelper<FileInfo>();

const displaySuffixes = {
    B: "b",
    kB: "k",
    MB: "m",
    GB: "g",
    TB: "t",
    KiB: "k",
    MiB: "m",
    GiB: "g",
    TiB: "t",
};

function getBestUnit(bytes: number, si: boolean = false, sigfig: number = 3): string {
    if (bytes < 0) {
        return "";
    }
    const units = si ? ["kB", "MB", "GB", "TB"] : ["KiB", "MiB", "GiB", "TiB"];
    const divisor = si ? 1000 : 1024;

    let currentUnit = "B";
    let currentValue = bytes;
    let idx = 0;
    while (currentValue > divisor && idx < units.length - 1) {
        currentUnit = units[idx];
        currentValue /= divisor;
    }

    return `${parseFloat(currentValue.toPrecision(sigfig))}${displaySuffixes[currentUnit]}`;
}

function getSpecificUnit(bytes: number, suffix: string): string {
    if (bytes < 0) {
        return "";
    }

    const divisors = new Map([
        ["B", 1],
        ["kB", 1e3],
        ["MB", 1e6],
        ["GB", 1e9],
        ["TB", 1e12],
        ["KiB", 0x400],
        ["MiB", 0x400 ** 2],
        ["GiB", 0x400 ** 3],
        ["TiB", 0x400 ** 4],
    ]);
    const divisor: number = divisors[suffix] ?? 1;

    return `${bytes / divisor} ${displaySuffixes[suffix]}`;
}

function getLastModifiedTime(
    unixMillis: number,
    locale: Intl.LocalesArgument,
    options: DateTimeFormatConfigType
): string {
    if (locale === "C") {
        locale = "lookup";
    }
    return new Date(unixMillis).toLocaleString(locale, options); //todo use config
}

const iconRegex = /^[a-z0-9- ]+$/;

function isIconValid(icon: string): boolean {
    if (util.isBlank(icon)) {
        return false;
    }
    return icon.match(iconRegex) != null;
}

function getIconClass(icon: string): string {
    if (!isIconValid(icon)) {
        return "fa fa-solid fa-question fa-fw";
    }
    return `fa fa-solid fa-${icon} fa-fw`;
}

function DirectoryTable({ data, cwd, setFileName }: DirectoryTableProps) {
    let settings = jotai.useAtomValue(atoms.settingsConfigAtom);
    const getIconFromMimeType = React.useCallback(
        (mimeType: string): string => {
            while (mimeType.length > 0) {
                let icon = settings.mimetypes[mimeType]?.icon ?? null;
                if (isIconValid(icon)) {
                    return `fa fa-solid fa-${icon} fa-fw`;
                }
                mimeType = mimeType.slice(0, -1);
            }
            return "fa fa-solid fa-question fa-fw";
        },
        [settings.mimetypes]
    );
    const columns = React.useMemo(
        () => [
            columnHelper.accessor("mimetype", {
                cell: (info) => <i className={getIconFromMimeType(info.getValue() ?? "")}></i>,
                header: () => <span></span>,
                id: "logo",
                size: 25,
            }),
            columnHelper.accessor("path", {
                cell: (info) => info.getValue(),
                header: () => <span>Name</span>,
            }),
            columnHelper.accessor("modestr", {
                cell: (info) => info.getValue(),
                header: () => <span>Permissions</span>,
                size: 91,
            }),
            columnHelper.accessor("modtime", {
                cell: (info) =>
                    getLastModifiedTime(info.getValue(), settings.datetime.locale, settings.datetime.format),
                header: () => <span>Last Modified</span>,
                size: 185,
            }),
            columnHelper.accessor("size", {
                cell: (info) => getBestUnit(info.getValue()),
                header: () => <span>Size</span>,
                size: 55,
            }),
            columnHelper.accessor("mimetype", {
                cell: (info) => info.getValue(),
                header: () => <span>Type</span>,
            }),
        ],
        [settings]
    );

    const table = useReactTable({
        data,
        columns,
        columnResizeMode: "onChange",
        getCoreRowModel: getCoreRowModel(),
    });

    const columnSizeVars = React.useMemo(() => {
        const headers = table.getFlatHeaders();
        const colSizes: { [key: string]: number } = {};
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i]!;
            colSizes[`--header-${header.id}-size`] = header.getSize();
            colSizes[`--col-${header.column.id}-size`] = header.column.getSize();
        }
        return colSizes;
    }, [table.getState().columnSizingInfo]);

    return (
        <div className="dir-table" style={{ ...columnSizeVars }}>
            <div className="dir-table-head">
                {table.getHeaderGroups().map((headerGroup) => (
                    <div className="dir-table-head-row" key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                            <div
                                className="dir-table-head-cell"
                                key={header.id}
                                style={{ width: `calc(var(--header-${header.id}-size) * 1px)` }}
                            >
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                                <div
                                    className="dir-table-head-resize"
                                    onMouseDown={header.getResizeHandler()}
                                    onTouchStart={header.getResizeHandler()}
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            {table.getState().columnSizingInfo.isResizingColumn ? (
                <MemoizedTableBody table={table} cwd={cwd} setFileName={setFileName} />
            ) : (
                <TableBody table={table} cwd={cwd} setFileName={setFileName} />
            )}
        </div>
    );
}

interface TableBodyProps {
    table: Table<FileInfo>;
    cwd: string;
    setFileName: (_: string) => void;
}

function TableBody({ table, cwd, setFileName }: TableBodyProps) {
    return (
        <div className="dir-table-body">
            {table.getRowModel().rows.map((row) => (
                <div
                    className="dir-table-body-row"
                    key={row.id}
                    tabIndex={0}
                    onDoubleClick={() => {
                        const newFileName = row.getValue("path") as string;
                        const fullPath = cwd.concat("/", newFileName);
                        setFileName(fullPath);
                    }}
                >
                    {row.getVisibleCells().map((cell) => {
                        return (
                            <div
                                className={clsx("dir-table-body-cell", "col-" + cell.column.id)}
                                key={cell.id}
                                style={{ width: `calc(var(--col-${cell.column.id}-size) * 1px)` }}
                            >
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

const MemoizedTableBody = React.memo(
    TableBody,
    (prev, next) => prev.table.options.data == next.table.options.data
) as typeof TableBody;

interface DirectoryPreviewProps {
    contentAtom: jotai.Atom<Promise<string>>;
    fileNameAtom: jotai.WritableAtom<string, [string], void>;
}

function DirectoryPreview({ contentAtom, fileNameAtom }: DirectoryPreviewProps) {
    const contentText = jotai.useAtomValue(contentAtom);
    let content: FileInfo[] = JSON.parse(contentText);
    let [fileName, setFileName] = jotai.useAtom(fileNameAtom);
    return <DirectoryTable data={content} cwd={fileName} setFileName={setFileName} />;
}

export { DirectoryPreview };
