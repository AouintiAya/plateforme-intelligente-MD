import React from 'react';
import { CommercialWatch } from '../services/ai';
import { TrendingUp, Users, Lightbulb, ShieldAlert } from 'lucide-react';

interface Props {
  watch: CommercialWatch;
}

export function CommercialWatchView({ watch }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8">
      <div className="bg-slate-900 p-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-400" />
          Veille Commerciale
        </h2>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-blue-50/50 p-5 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2 mb-4 text-blue-800 font-semibold">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3>Tendances du Marché</h3>
          </div>
          <ul className="space-y-3">
            {watch.marketTrends.map((trend, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span>{trend}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-rose-50/50 p-5 rounded-xl border border-rose-100">
          <div className="flex items-center gap-2 mb-4 text-rose-800 font-semibold">
            <Users className="w-5 h-5 text-rose-600" />
            <h3>Concurrents</h3>
          </div>
          <ul className="space-y-3">
            {watch.competitors.map((comp, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                <span>{comp}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-4 text-emerald-800 font-semibold">
            <Lightbulb className="w-5 h-5 text-emerald-600" />
            <h3>Opportunités</h3>
          </div>
          <ul className="space-y-3">
            {watch.opportunities.map((opp, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span>{opp}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-amber-50/50 p-5 rounded-xl border border-amber-100">
          <div className="flex items-center gap-2 mb-4 text-amber-800 font-semibold">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <h3>Menaces</h3>
          </div>
          <ul className="space-y-3">
            {watch.threats.map((threat, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-700 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <span>{threat}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
