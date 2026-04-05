import React from 'react';

interface Props {
  years: Record<number, number>;
  venues: Record<string, number>;
  selectedYears: number[];
  selectedVenues: string[];
  accessible: boolean;
  indexedOnly: boolean;
  onToggleYear: (y: number) => void;
  onToggleVenue: (v: string) => void;
  onToggleAccessible: () => void;
  onToggleIndexed: () => void;
  onResetYears: () => void;
  onResetVenues: () => void;
  disabled?: boolean;
}

export default function TagFilters({
  years, venues, selectedYears, selectedVenues,
  accessible, indexedOnly,
  onToggleYear, onToggleVenue, onToggleAccessible, onToggleIndexed,
  onResetYears, onResetVenues, disabled,
}: Props) {
  return (
    <div className={`space-y-3 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2 w-12">Year</span>
        {Object.entries(years).map(([y, count]) => {
          const yn = Number(y);
          const active = selectedYears.includes(yn);
          return (
            <button
              key={y}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'border-gray-250 text-gray-600 hover:bg-gray-100 hover:border-gray-300 bg-white'
              }`}
              onClick={() => onToggleYear(yn)}
            >
              {y} <span className={active ? 'text-indigo-200' : 'text-gray-400'}>({count})</span>
            </button>
          );
        })}
        <button className="text-xs text-gray-400 ml-1 hover:text-indigo-600 font-medium" onClick={onResetYears}>Reset</button>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2 w-12">Venue</span>
        {Object.entries(venues).map(([v, count]) => {
          const active = selectedVenues.includes(v);
          return (
            <button
              key={v}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'border-gray-250 text-gray-600 hover:bg-gray-100 hover:border-gray-300 bg-white'
              }`}
              onClick={() => onToggleVenue(v)}
            >
              {v} <span className={active ? 'text-indigo-200' : 'text-gray-400'}>({count})</span>
            </button>
          );
        })}
        <button className="text-xs text-gray-400 ml-1 hover:text-indigo-600 font-medium" onClick={onResetVenues}>Reset</button>
      </div>

      <div className="flex gap-5 items-center pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <div className={`relative w-8 h-[18px] rounded-full transition-colors ${accessible ? 'bg-indigo-600' : 'bg-gray-300'}`} onClick={onToggleAccessible}>
            <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${accessible ? 'left-[17px]' : 'left-[2px]'}`} />
          </div>
          <span className="text-sm text-gray-700 group-hover:text-gray-900">PDF Downloadable</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none group">
          <div className={`relative w-8 h-[18px] rounded-full transition-colors ${indexedOnly ? 'bg-indigo-600' : 'bg-gray-300'}`} onClick={onToggleIndexed}>
            <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${indexedOnly ? 'left-[17px]' : 'left-[2px]'}`} />
          </div>
          <span className="text-sm text-gray-700 group-hover:text-gray-900">Indexed Only</span>
        </label>
      </div>

      {disabled && (
        <p className="text-xs text-amber-600 font-medium">Filters are not available for arXiv search — use arXiv query syntax instead.</p>
      )}
    </div>
  );
}