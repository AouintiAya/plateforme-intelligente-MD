import React from 'react';
import { ProductSheet } from '../services/ai';
import { AlertCircle, Target, Clock, DollarSign, Monitor, Layers, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  sheet: ProductSheet;
}

export function ProductSheetView({ sheet }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {sheet.isHypothesis && (
        <div className="bg-amber-50 border-b border-amber-200 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-amber-800 font-semibold text-sm uppercase tracking-wider">
              Fiche Produit Hypothèse – À Confirmer
            </h3>
            <p className="text-amber-700 text-sm mt-1">
              Cette fiche a été générée automatiquement à partir d'un contexte partiel. Les informations ci-dessous sont des estimations et doivent être validées.
            </p>
          </div>
        </div>
      )}

      <div className="p-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">{sheet.title}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <section>
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold">
                <Target className="w-5 h-5 text-blue-600" />
                <h3>Objectifs</h3>
              </div>
              <ul className="space-y-2">
                {sheet.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold">
                <Layers className="w-5 h-5 text-purple-600" />
                <h3>Public Cible</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {sheet.targetAudience.map((aud, i) => (
                  <span key={i} className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-md text-sm font-medium border border-purple-100">
                    {aud}
                  </span>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-3 text-slate-800 font-semibold">
                <Monitor className="w-5 h-5 text-emerald-600" />
                <h3>Technologies</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {sheet.technologies.map((tech, i) => (
                  <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-sm font-medium border border-emerald-100">
                    {tech}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <Layers className="w-4 h-4" />
                  <span className="text-sm font-medium">Format</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{sheet.format}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-medium">Durée</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{sheet.duration}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <DollarSign className="w-4 h-4" />
                  <span className="text-sm font-medium">Prix</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{sheet.priceRange}</span>
              </div>
            </div>

            {sheet.isHypothesis && sheet.uncertainties.length > 0 && (
              <section className="bg-orange-50/50 rounded-lg p-4 border border-orange-100">
                <div className="flex items-center gap-2 mb-3 text-orange-800 font-semibold">
                  <HelpCircle className="w-5 h-5 text-orange-600" />
                  <h3>Zones d'incertitude</h3>
                </div>
                <ul className="space-y-2">
                  {sheet.uncertainties.map((unc, i) => (
                    <li key={i} className="flex items-start gap-2 text-orange-700 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                      <span>{unc}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
