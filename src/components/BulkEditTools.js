'use client';

export function BulkSelectionBar({
  selectedCount,
  visibleCount,
  allVisibleSelected,
  onToggleVisible,
  onClear,
  onEdit,
  itemLabel = 'รายการ',
  disabled = false,
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(allVisibleSelected)}
            onChange={onToggleVisible}
            disabled={disabled || visibleCount === 0}
            className="h-4 w-4 accent-blue-600"
            aria-label="เลือกทุกรายการที่แสดง"
          />
          เลือกทั้งหมดที่แสดง ({visibleCount})
        </label>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-blue-700">
          เลือกแล้ว {selectedCount} {itemLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || selectedCount === 0}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-40"
        >
          ล้างที่เลือก
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled || selectedCount === 0}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-40"
        >
          แก้ไขที่เลือก ({selectedCount})
        </button>
      </div>
    </div>
  );
}

export function BulkEditDialog({
  title,
  selectedCount,
  saving = false,
  onClose,
  onSubmit,
  children,
  submitLabel = 'บันทึกการแก้ไข',
  error = '',
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 sm:text-2xl">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">กำลังแก้ไข {selectedCount} รายการ · ช่องที่เลือก “ไม่เปลี่ยน” จะคงค่าเดิมไว้</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            aria-label="ปิดหน้าต่างแก้ไข"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
          {children}
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function RowCheckbox({ checked, onChange, label }) {
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-blue-600"
    />
  );
}
