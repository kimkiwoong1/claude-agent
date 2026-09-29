#!/usr/bin/env python3
"""
자산탐지(1단계)/역할분류(1.5단계) 결과를 Excel 자산 인벤토리로 변환.

입력: CSV (UTF-8), 헤더 필수 컬럼 —
    subdomain,resolved_to,source,role_guess,importance,notes

    - subdomain    : 서브도메인/호스트명
    - resolved_to  : IP 또는 CNAME 체인 (없으면 빈 값)
    - source       : crtsh / dns-bruteforce / subfinder 등 확보 출처
    - role_guess   : 추정 역할 (asset-role-classification.md 표 기반)
    - importance   : 상 / 중 / 하
    - notes        : 비고 (스코프 외 여부, 응답 없음 등)

출력: xlsx (헤더 스타일링 + 중요도별 색상 강조 + 컬럼 자동폭)

사용:
    python export_asset_inventory.py input.csv output.xlsx --target secui.com
"""
import argparse
import csv
import sys
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

IMPORTANCE_FILL = {
    "상": PatternFill(start_color="F8CBAD", end_color="F8CBAD", fill_type="solid"),
    "중": PatternFill(start_color="FFE699", end_color="FFE699", fill_type="solid"),
    "하": PatternFill(start_color="C6E0B4", end_color="C6E0B4", fill_type="solid"),
}
HEADER_FILL = PatternFill(start_color="305496", end_color="305496", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True)

REQUIRED_COLUMNS = ["subdomain", "resolved_to", "source", "role_guess", "importance", "notes"]


def build_workbook(rows, target):
    wb = Workbook()
    ws = wb.active
    ws.title = "asset_inventory"

    ws.append([f"자산 인벤토리 - {target}", "", "", "", "", ""])
    ws.append([f"생성일시: {datetime.now().strftime('%Y-%m-%d %H:%M')}", "", "", "", "", ""])
    ws.append([])
    ws.merge_cells("A1:F1")
    ws.merge_cells("A2:F2")
    ws["A1"].font = Font(bold=True, size=14)

    header_row_idx = 4
    headers = ["서브도메인", "IP/CNAME", "확보출처", "추정역할", "중요도", "비고"]
    ws.append(headers)
    for col_idx, _ in enumerate(headers, start=1):
        cell = ws.cell(row=header_row_idx, column=col_idx)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center")

    importance_rank = {"상": 0, "중": 1, "하": 2}
    rows_sorted = sorted(rows, key=lambda r: importance_rank.get(r.get("importance", ""), 3))

    for row in rows_sorted:
        ws.append([
            row.get("subdomain", ""),
            row.get("resolved_to", ""),
            row.get("source", ""),
            row.get("role_guess", ""),
            row.get("importance", ""),
            row.get("notes", ""),
        ])
        fill = IMPORTANCE_FILL.get(row.get("importance", ""))
        if fill:
            ws.cell(row=ws.max_row, column=5).fill = fill

    widths = [30, 34, 16, 40, 8, 40]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = f"A{header_row_idx + 1}"
    return wb


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input_csv", help="자산 목록 CSV 경로")
    parser.add_argument("output_xlsx", help="출력 xlsx 경로")
    parser.add_argument("--target", default="", help="대상 도메인/회사명 (제목에 표기)")
    args = parser.parse_args()

    with open(args.input_csv, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED_COLUMNS if c not in reader.fieldnames]
        if missing:
            sys.exit(f"CSV에 필수 컬럼 누락: {missing} (필요: {REQUIRED_COLUMNS})")
        rows = list(reader)

    wb = build_workbook(rows, args.target or args.input_csv)
    wb.save(args.output_xlsx)
    print(f"저장 완료: {args.output_xlsx} ({len(rows)}건)")


if __name__ == "__main__":
    main()
