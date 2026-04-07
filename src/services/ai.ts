import { GoogleGenAI, Type } from "@google/genai";
import { safeJsonParse } from "../lib/ai-utils";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ProductSheet {
  isHypothesis: boolean;
  title: string;
  objectives: string[];
  targetAudience: string[];
  technologies: string[];
  format: string;
  duration: string;
  priceRange: string;
  uncertainties: string[];
}

export interface CommercialWatch {
  marketTrends: string[];
  competitors: string[];
  opportunities: string[];
  threats: string[];
}

export interface AnalysisResult {
  productSheet: ProductSheet;
  commercialWatch: CommercialWatch;
}

export async function analyzeInput(input: string): Promise<AnalysisResult> {
  const prompt = `
Tu es un expert en conception de produits et en stratégie commerciale.
Règle d'entrée (obligatoire) :
Tu dois considérer comme input valide :
- un document structuré
- OU un texte libre
- OU un contexte partiel

Si aucun document de fiche produit complet n'est fourni :
1. Interprète le texte comme une intention de produit ou de formation.
2. Génère automatiquement une fiche produit hypothétique comprenant :
   - Titre provisoire
   - Objectifs supposés
   - Public cible supposé
   - Technologies probables
   - Format estimé
   - Durée estimée
   - Fourchette de prix estimée
3. Marque clairement cette fiche comme hypothétique (isHypothesis = true).
4. Signale explicitement les hypothèses et les zones d'incertitude.
5. Utilise cette fiche comme base pour lancer une veille commerciale (tendances du marché, concurrents, opportunités, menaces).

Si le document fourni est déjà une fiche produit complète, extrais simplement les informations et effectue la veille commerciale (isHypothesis = false).

Voici l'input de l'utilisateur :
"""
${input}
"""
`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          productSheet: {
            type: Type.OBJECT,
            properties: {
              isHypothesis: { type: Type.BOOLEAN, description: "True si l'input n'était pas une fiche produit complète et que des hypothèses ont été faites." },
              title: { type: Type.STRING, description: "Titre provisoire ou définitif" },
              objectives: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Objectifs (supposés ou réels)" },
              targetAudience: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Public cible (supposé ou réel)" },
              technologies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Technologies probables ou réelles" },
              format: { type: Type.STRING, description: "Format estimé ou réel" },
              duration: { type: Type.STRING, description: "Durée estimée ou réelle" },
              priceRange: { type: Type.STRING, description: "Fourchette de prix estimée ou réelle" },
              uncertainties: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Zones d'incertitude et hypothèses formulées (vide si isHypothesis est false)" }
            },
            required: ["isHypothesis", "title", "objectives", "targetAudience", "technologies", "format", "duration", "priceRange", "uncertainties"]
          },
          commercialWatch: {
            type: Type.OBJECT,
            properties: {
              marketTrends: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tendances du marché" },
              competitors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Concurrents potentiels ou existants" },
              opportunities: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Opportunités commerciales" },
              threats: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Menaces ou risques" }
            },
            required: ["marketTrends", "competitors", "opportunities", "threats"]
          }
        },
        required: ["productSheet", "commercialWatch"]
      }
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from AI");
  }

  return safeJsonParse<AnalysisResult>(text, {} as AnalysisResult);
}
