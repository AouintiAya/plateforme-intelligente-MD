import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Search, 
  Upload, 
  Link as LinkIcon, 
  FileText, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  BarChart3, 
  Zap, 
  RefreshCw,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  XCircle,
  Clock,
  ChevronRight,
  Target,
  Coins,
  Calendar,
  LogIn,
  LogOut,
  Database,
  Check,
  X,
  History,
  Download,
  Save,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  ProductData, 
  WorkflowState, 
  AnalysisAgentOutput, 
  SearchAgentOutput, 
  CreationAgentOutput, 
  ValidationAgentOutput,
  MarketingAgentOutput
} from './types';
import { 
  extractProductData, 
  runAnalysisAgent, 
  runSearchAgent, 
  runCreationAgent, 
  runValidationAgent,
  runMarketingAgent,
  runIntelligenceAgent
} from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { 
  auth, 
  db, 
  googleProvider, 
  OperationType,
  handleFirestoreError
} from './firebase';
import { User, signInWithPopup, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  getDoc,
  setDoc, 
  doc, 
  updateDoc, 
  Timestamp, 
  query, 
  orderBy,
  where,
  limit,
  collectionGroup
} from 'firebase/firestore';

const INITIAL_PRODUCT_DATA: ProductData = {
  title: '',
  concept: '',
  target: '',
  why: '',
  includes: '',
  supports: '',
  format: '',
  duration: '',
  references: '',
  differentiation: '',
  ecosystem: '',
  region: '',
  certifications: '',
  price: ''
};

const cleanForFirestore = (obj: any): any => {
  if (obj === null || typeof obj !== 'object' || obj instanceof Timestamp) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item));
  }
  
  const cleaned: any = {};
  Object.keys(obj).forEach(key => {
    if (obj[key] !== undefined) {
      cleaned[key] = cleanForFirestore(obj[key]);
    }
  });
  return cleaned;
};

export default function App() {
  const [workflow, setWorkflow] = useState<WorkflowState>({
    mode: 'VALIDATION',
    step: 'INPUT',
    productData: INITIAL_PRODUCT_DATA
  });
  const [intelligenceQuery, setIntelligenceQuery] = useState('');
  const [validationContext, setValidationContext] = useState('');
  const [intelligenceContext, setIntelligenceContext] = useState('');
  const [validationFile, setValidationFile] = useState<{ name: string, type: string, preview?: string, data: string } | null>(null);
  const [intelligenceFile, setIntelligenceFile] = useState<{ name: string, type: string, preview?: string, data: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoAnalyse, setAutoAnalyse] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [activeDashboard, setActiveDashboard] = useState<'FICHE' | 'VEILLE' | 'MARKETING' | 'HISTORIQUE'>('FICHE');
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [formations, setFormations] = useState<ProductData[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [needsReanalysis, setNeedsReanalysis] = useState(false);
  const [savedProductData, setSavedProductData] = useState<ProductData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFormationDropdownOpen, setIsFormationDropdownOpen] = useState(false);
  const formationDropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const analysisController = useRef<AbortController | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formationDropdownRef.current && !formationDropdownRef.current.contains(event.target as Node)) {
        setIsFormationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch formations
  const fetchFormations = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'formations'), 
        where('uid', '==', user.uid),
        orderBy('title', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setFormations(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'formations');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchFormations();
    }
  }, [user, fetchFormations]);

  // Fetch analyses
  const fetchAnalyses = useCallback(async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, 'analyses'), 
        where('uid', '==', user.uid),
        orderBy('updatedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnalyses(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'analyses');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAnalyses();
    }
  }, [user, fetchAnalyses]);

  const saveToFirebase = async (state: WorkflowState) => {
    if (!user) return;

    // Validation Rule: Only save if all scores are green or orange (>= 50)
    // and mandatory manual fields are filled.
    if (state.mode === 'VALIDATION') {
      const scores = state.analysis?.efficiency;
      if (!scores) {
        alert("Veuillez d'abord lancer l'analyse pour obtenir les scores d'efficience.");
        return;
      }

      const redScores = Object.entries(scores).filter(([_, score]) => score < 50);
      if (redScores.length > 0) {
        alert("Impossible d'enregistrer : certains scores sont rouges. Veuillez améliorer la fiche produit.");
        return;
      }

      if (!state.productData.region || !state.productData.certifications || !state.productData.price) {
        alert("Veuillez remplir les champs obligatoires : Prix, Région et Labels/certifications.");
        return;
      }
    }
    
    setIsSaving(true);
    let formationId = state.formationId;
    let isNewFormation = !formationId;

    try {
      if (state.mode === 'VALIDATION') {
        // 1. Handle Formation
        if (!formationId && state.productData.title) {
          const q = query(collection(db, 'formations'), where('title', '==', state.productData.title), limit(1));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            formationId = snapshot.docs[0].id;
            isNewFormation = false;
          }
        }

        if (!formationId) {
          formationId = doc(collection(db, 'formations')).id;
          isNewFormation = true;
        }

        const formationData = {
          id: formationId,
          uid: user.uid,
          ...state.productData,
          updatedAt: Timestamp.now(),
          ...(isNewFormation ? { createdAt: Timestamp.now() } : {})
        };

        await setDoc(doc(db, 'formations', formationId), cleanForFirestore(formationData), { merge: true });

        const analysisData: any = {
          id: formationId,
          formationId: formationId,
          uid: user.uid,
          title: state.productData.title,
          mode: state.mode,
          updatedAt: Timestamp.now(),
          analysis: state.analysis || null,
          search: state.search || null,
          creation: state.creation || null,
          validation: state.validation || null,
          marketing: state.marketing || null,
          step: state.step,
          ...(isNewFormation ? { createdAt: Timestamp.now() } : {})
        };

        await setDoc(doc(db, 'analyses', formationId), cleanForFirestore(analysisData), { merge: true });
        setWorkflow(prev => ({ ...prev, formationId: formationId, id: formationId }));
        setSavedProductData(state.productData);
      } else {
        // INTELLIGENCE Mode
        if (!formationId) {
          formationId = doc(collection(db, 'analyses')).id;
          isNewFormation = true;
        }

        const analysisData: any = {
          id: formationId,
          uid: user.uid,
          title: state.intelligenceQuery || "Veille Exploratoire",
          mode: state.mode,
          intelligenceQuery: state.intelligenceQuery,
          updatedAt: Timestamp.now(),
          search: state.search || null,
          marketing: state.marketing || null,
          step: state.step,
          ...(isNewFormation ? { createdAt: Timestamp.now() } : {})
        };

        await setDoc(doc(db, 'analyses', formationId), cleanForFirestore(analysisData), { merge: true });
        setWorkflow(prev => ({ ...prev, formationId: formationId, id: formationId }));
      }
      
      setSaveSuccess(true);
      // setNeedsReanalysis(false); // Problem 1: Keep re-analysis option if data was modified
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchAnalyses();
    } catch (error: any) {
      console.error("Save failed:", error);
      handleFirestoreError(error, OperationType.WRITE, `analyses/${formationId || 'new'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const exportToPDF = async () => {
    if (!workflow.productData.title) return;
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      let y = margin;

      // Helper for text wrapping and page breaks
      const addText = (text: string, fontSize = 10, isBold = false, color = [0, 0, 0]) => {
        doc.setFontSize(fontSize);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(color[0], color[1], color[2]);
        
        const lines = doc.splitTextToSize(text || "", contentWidth);
        lines.forEach((line: string) => {
          if (y + 10 > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += fontSize * 0.6;
        });
        y += 2;
      };

      const addSection = (title: string, color = [30, 41, 59]) => {
        if (y + 25 > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        y += 5;
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(margin, y, contentWidth, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), margin + 3, y + 7);
        y += 18;
      };

      // Header
      doc.setFillColor(42, 203, 198); // Brand Color (Primary)
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text("RAPPORT D'INTELLIGENCE", margin, 20);
      doc.setFontSize(12);
      doc.text(`Formation : ${workflow.productData.title}`, margin, 30);
      doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin - 40, 30);
      y = 55;

      // 1. Fiche Produit
      addSection("1. FICHE PRODUIT ORIGINALE");
      addText(`Titre : ${workflow.productData.title}`, 11, true);
      addText(`Concept : ${workflow.productData.concept}`, 10);
      addText(`Durée : ${workflow.productData.duration}`, 10);
      addText(`Cible : ${workflow.productData.target}`, 10);
      addText(`Format : ${workflow.productData.format}`, 10);
      addText(`Région : ${workflow.productData.region}`, 10);
      addText(`Certifications : ${workflow.productData.certifications}`, 10);
      addText(`Pourquoi :`, 10, true);
      addText(workflow.productData.why, 9);
      addText(`Inclus :`, 10, true);
      addText(workflow.productData.includes, 9);

      // 2. Analyse Diagnostic
      if (workflow.analysis) {
        addSection("2. DIAGNOSTIC & ANALYSE", [16, 163, 74]); // Green
        addText("Diagnostic Global :", 11, true);
        addText(workflow.analysis.diagnostic, 10);
        
        addText("Points Forts :", 10, true);
        workflow.analysis.strengths.forEach(s => addText(`• ${s}`, 9));
        
        addText("Points Faibles :", 10, true);
        workflow.analysis.weaknesses.forEach(w => addText(`• ${w}`, 9));
        
        addText("Risques Identifiés :", 10, true);
        workflow.analysis.risks.forEach(r => addText(`• ${r}`, 9));
      }

      // 3. Veille Concurrentielle
      if (workflow.search) {
        addSection("3. VEILLE CONCURRENTIELLE & MARCHÉ", [37, 99, 235]); // Blue
        addText("Analyse du Marché :", 11, true);
        addText(workflow.search.results, 10);
        
        addText("Concurrents Directs :", 10, true);
        workflow.search.competitors.forEach(c => {
          addText(`- ${c.name} (${c.priceRange})`, 9, true);
          addText(`  Forces : ${c.strengths.join(', ')}`, 8);
          addText(`  Faiblesses : ${c.weaknesses.join(', ')}`, 8);
        });
        
        addText("Tendances Détectées :", 10, true);
        workflow.search.trends.forEach(t => addText(`• ${t}`, 9));
      }

      // 4. Veille Marketing & Sentiment
      if (workflow.marketing) {
        addSection("4. VEILLE MARKETING & SENTIMENT", [217, 119, 6]); // Amber
        addText(`Score de Sentiment Global : ${workflow.marketing.sentimentAnalysis.score}/100`, 12, true);
        addText(`Perception : ${workflow.marketing.sentimentAnalysis.overall}`, 11, true, workflow.marketing.sentimentAnalysis.overall === 'POSITIVE' ? [22, 163, 74] : [220, 38, 38]);
        
        addText("Feedback Étudiants (Points clés) :", 10, true);
        workflow.marketing.sentimentAnalysis.studentFeedback.forEach(f => addText(`• ${f}`, 9));
        
        addText("Feedback Professionnels :", 10, true);
        workflow.marketing.sentimentAnalysis.proFeedback.forEach(f => addText(`• ${f}`, 9));
        
        addText("Recommandations de Contenu Stratégique :", 11, true);
        workflow.marketing.contentRecommendations.forEach(r => {
          addText(`- [${r.format}] ${r.title}`, 10, true);
          addText(`  ${r.description}`, 9);
        });

        addText("Monitoring Réseaux Sociaux :", 10, true);
        workflow.marketing.socialMonitoring.forEach(p => {
          addText(`${p.platform} :`, 9, true);
          p.latestPosts.slice(0, 2).forEach(post => {
            addText(`  "${post.content.substring(0, 100)}..." (${post.author})`, 8);
          });
        });
      }

      // 5. Recommandations Stratégiques
      if (workflow.creation) {
        addSection("5. RECOMMANDATIONS STRATÉGIQUES", [147, 51, 234]); // Purple
        addText("Fiche Optimisée (Titre) : " + (workflow.creation.correctedFiche?.title || "N/A"), 11, true);
        addText("Conseils Marketing :", 10, true);
        workflow.creation.marketingRecommendations.forEach(r => addText(`• ${r}`, 9));
        
        addText("Conseils de Campagne :", 10, true);
        workflow.creation.campaignAdvice.forEach(r => addText(`• ${r}`, 9));
      }

      // 6. Validation Finale
      if (workflow.validation) {
        addSection("6. VALIDATION FINALE", [30, 41, 59]); // Slate
        addText(`Décision : ${workflow.validation.decision}`, 14, true, workflow.validation.decision === 'VALIDATED' ? [22, 163, 74] : [220, 38, 38]);
        addText("Justification Stratégique :", 10, true);
        addText(workflow.validation.justification, 10);
      }

      // Footer with page numbers
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} sur ${pageCount} - Rapport généré par NET-INFO Intelligence`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }

      doc.save(`Rapport_Strategique_${workflow.productData.title.replace(/\s+/g, '_') || 'Analyse'}.pdf`);
    } catch (error) {
      console.error("PDF Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const [showSourceData, setShowSourceData] = useState(false);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = () => auth.signOut();

  const loadAnalysis = async (analysis: any) => {
    try {
      if (analysis.mode === 'INTELLIGENCE') {
        setWorkflow({
          id: analysis.id,
          mode: 'INTELLIGENCE',
          intelligenceQuery: analysis.intelligenceQuery,
          step: analysis.step || 'FINAL',
          productData: INITIAL_PRODUCT_DATA,
          search: analysis.search || undefined,
          marketing: analysis.marketing || undefined
        });
        setIntelligenceQuery(analysis.intelligenceQuery || '');
        setSearchQuery(analysis.title || '');
        setActiveDashboard('VEILLE');
      } else {
        const formationDoc = await getDoc(doc(db, 'formations', analysis.formationId));
        const productData = formationDoc.exists() ? { ...INITIAL_PRODUCT_DATA, ...formationDoc.data() } as ProductData : INITIAL_PRODUCT_DATA;
        
        setWorkflow({
          id: analysis.id,
          formationId: analysis.formationId,
          mode: 'VALIDATION',
          step: analysis.step || 'INPUT',
          productData,
          analysis: analysis.analysis || undefined,
          search: analysis.search || undefined,
          creation: analysis.creation || undefined,
          validation: analysis.validation || undefined,
          marketing: analysis.marketing || undefined
        });
        setSavedProductData(productData);
        setSearchQuery(analysis.title || '');
        setValidationContext(productData.concept || '');
        setActiveDashboard('FICHE');
      }
      setNeedsReanalysis(false);
      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Load analysis failed:", error);
      handleFirestoreError(error, OperationType.GET, `analyses/${analysis.id}`);
    }
  };

  const getScoreTextColor = (score: number | undefined) => {
    if (score === undefined) return 'text-slate-800';
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreColor = (score: number | undefined) => {
    if (score === undefined) return 'bg-slate-200';
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getScoreBorder = (score: number | undefined) => {
    if (score === undefined) return 'border-slate-200 focus:border-primary/50';
    if (score >= 80) return 'border-green-300 focus:border-green-500 ring-1 ring-green-100';
    if (score >= 50) return 'border-amber-300 focus:border-amber-500 ring-1 ring-amber-100';
    return 'border-red-300 focus:border-red-500 ring-1 ring-red-100';
  };

  const getMissingFields = () => {
    const missing = [];
    if (!workflow.productData.title) missing.push("Titre");
    if (!workflow.productData.concept) missing.push("Concept");
    if (!workflow.productData.target) missing.push("Cible");
    if (!workflow.productData.why) missing.push("Pourquoi");
    if (!workflow.productData.includes) missing.push("Inclus");
    if (!workflow.productData.supports) missing.push("Supports");
    if (!workflow.productData.format) missing.push("Format");
    if (!workflow.productData.duration) missing.push("Durée");
    if (!workflow.productData.region) missing.push("Région");
    if (!workflow.productData.certifications) missing.push("Certifications");
    if (!workflow.productData.price) missing.push("Prix");
    return missing;
  };

  const runIntelligenceWorkflow = async (query: string) => {
    if (!query.trim() && !intelligenceFile) return;
    setIsProcessing(true);
    setCurrentAgent("Expert en Veille Stratégique");
    try {
      const fileData = intelligenceFile ? { data: intelligenceFile.data, mimeType: intelligenceFile.type } : undefined;
      const result = await runIntelligenceAgent(query || "Analyse de contexte", "", fileData);
      
      // Map intelligence result to workflow state
      const intelligenceState: WorkflowState = {
        ...workflow,
        mode: 'INTELLIGENCE',
        intelligenceQuery: query || (intelligenceFile ? `Analyse de ${intelligenceFile.name}` : "Analyse de contexte"),
        step: 'FINAL',
        search: {
          results: result.analysis,
          benchmarks: [],
          competitors: result.competitors.map(c => ({
            name: c.name,
            strengths: [c.description],
            weaknesses: [c.relevance],
            priceRange: 'N/A'
          })),
          competitiveness: 'N/A',
          trends: result.trends,
          opportunities: result.opportunities,
          threats: [],
          groundingChunks: result.groundingChunks
        },
        marketing: {
          socialMonitoring: [],
          sentimentAnalysis: {
            overall: 'NEUTRAL',
            studentFeedback: [],
            proFeedback: [],
            score: 50,
            justification: result.analysis
          },
          newsAndTrends: result.trends.map(t => ({
            title: t,
            description: '',
            source: 'Google Search',
            url: '',
            sentimentScore: 50
          })),
          contentRecommendations: result.recommendations.map(r => ({
            title: r,
            description: '',
            format: 'ARTICLE',
            inspiredBySources: []
          }))
        }
      };
      
      setWorkflow(intelligenceState);
      setActiveDashboard('VEILLE');

      // if (user) {
      //   await saveToFirebase(intelligenceState);
      // }
    } catch (error: any) {
      console.error("Intelligence workflow failed:", error);
      setWorkflow(prev => ({ ...prev, error: "Une erreur est survenue lors de la veille exploratoire." }));
    } finally {
      setIsProcessing(false);
      setCurrentAgent(null);
    }
  };

  const runFullWorkflow = async (data: ProductData, context: string) => {
    setIsProcessing(true);
    setNeedsReanalysis(false);
    try {
      // Agent 1: Analysis
      setCurrentAgent("Analyse");
      const analysis = await runAnalysisAgent(data, context);
      setWorkflow(prev => ({ ...prev, analysis, analysisId: Date.now().toString(), step: 'ANALYSIS' }));

      // Agent 2: Search
      setCurrentAgent("Recherche");
      setActiveDashboard('VEILLE');
      const search = await runSearchAgent(analysis, data);
      setWorkflow(prev => ({ ...prev, search, step: 'SEARCH' }));

      // Agent 5: Marketing
      setCurrentAgent("Veille Marketing");
      const marketing = await runMarketingAgent(data, search);
      setWorkflow(prev => ({ ...prev, marketing, step: 'MARKETING' }));

      // Agent 3: Creation
      setCurrentAgent("Création");
      const creation = await runCreationAgent(analysis, search);
      setWorkflow(prev => ({ ...prev, creation, step: 'CREATION' }));

      // Agent 4: Validation
      setCurrentAgent("Validation");
      const validation = await runValidationAgent(data, creation);
      const finalState: WorkflowState = { 
        ...workflow, 
        mode: 'VALIDATION',
        analysis, 
        search, 
        marketing,
        creation, 
        validation, 
        step: 'FINAL' 
      };
      setWorkflow(finalState);

      // Auto-save to Firebase if authenticated AND it's a new analysis
      // Problem 6: Manual save for modifications
      // if (user && !workflow.id) {
      //   await saveToFirebase(finalState);
      // }

    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Workflow failed:", error);
      const errorMessage = error.message?.includes("RESOURCE_EXHAUSTED") 
        ? "Quota API atteint. Veuillez patienter quelques minutes avant de réessayer."
        : "Une erreur est survenue lors du processus multi-agent.";
      setWorkflow(prev => ({ ...prev, error: errorMessage }));
    } finally {
      setIsProcessing(false);
      setCurrentAgent(null);
    }
  };

  // Auto-analysis effect
  useEffect(() => {
    if (!autoAnalyse || !workflow.productData.title || workflow.productData.title.length < 5) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      // Cancel previous request if any
      if (analysisController.current) {
        analysisController.current.abort();
      }
      analysisController.current = new AbortController();

      if (workflow.step === 'INPUT') {
        // Just update analysis for field colors
        setIsProcessing(true);
        setCurrentAgent("Analyse rapide");
        try {
          const analysis = await runAnalysisAgent(workflow.productData, validationContext);
          setWorkflow(prev => ({ ...prev, analysis, analysisId: Date.now().toString() }));
        } catch (error: any) {
          if (error.name === 'AbortError') return;
          console.error("Quick analysis failed:", error);
          if (error.message?.includes("RESOURCE_EXHAUSTED")) {
            setWorkflow(prev => ({ ...prev, error: "Quota API atteint. Veuillez patienter quelques minutes." }));
          }
        } finally {
          setIsProcessing(false);
          setCurrentAgent(null);
        }
      }
    }, 5000);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (analysisController.current) analysisController.current.abort();
    };
  }, [workflow.productData, validationContext, workflow.step === 'INPUT']); // Only re-run if data changes or we transition from INPUT

  const handleInputChange = (field: keyof ProductData, value: string) => {
    setWorkflow(prev => {
      const newWorkflow = {
        ...prev,
        productData: { ...prev.productData, [field]: value }
      };
      
      // Clear the specific field's score when modified so the color indicator disappears
      // until it is re-analyzed (either manually or via auto-analyse)
      if (prev.step === 'INPUT' && prev.analysis?.efficiency) {
        newWorkflow.analysis = {
          ...prev.analysis,
          efficiency: {
            ...prev.analysis.efficiency,
            [field]: undefined
          }
        };
      }
      
      return newWorkflow;
    });
    
    if (workflow.step !== 'INPUT') {
      setNeedsReanalysis(true);
    }
  };

  const handleExtractFromText = async () => {
    if (!validationContext.trim()) return;
    setIsProcessing(true);
    setCurrentAgent("Extraction");
    try {
      const data = await extractProductData(validationContext);
      setWorkflow(prev => ({ ...prev, productData: data }));
    } catch (error) {
      console.error("Extraction failed:", error);
    } finally {
      setIsProcessing(false);
      setCurrentAgent(null);
    }
  };

  const startWorkflow = async () => {
    let currentData = workflow.productData;
    
    // If title is missing but we have validation context, try to extract first
    if (!currentData.title && validationContext.trim()) {
      setIsProcessing(true);
      setCurrentAgent("Extraction");
      try {
        currentData = await extractProductData(validationContext);
        setWorkflow(prev => ({ ...prev, productData: currentData }));
      } catch (error) {
        console.error("Initial extraction failed:", error);
        setIsProcessing(false);
        setCurrentAgent(null);
        return;
      }
    }

    if (!currentData.title) {
      alert("Veuillez saisir au moins un titre ou un contexte additionnel pour lancer la veille.");
      setIsProcessing(false);
      setCurrentAgent(null);
      return;
    }

    setWorkflow(prev => ({ ...prev, step: 'ANALYSIS' }));
    await runFullWorkflow(currentData, validationContext);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const fileData = await new Promise<{ data: string, mimeType: string, preview?: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          const preview = file.type.startsWith('image/') ? (reader.result as string) : undefined;
          resolve({ data: base64, mimeType: file.type, preview });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      if (workflow.mode === 'INTELLIGENCE') {
        setIntelligenceFile({
          name: file.name,
          type: file.type,
          preview: fileData.preview,
          data: fileData.data
        });
      } else {
        setValidationFile({
          name: file.name,
          type: file.type,
          preview: fileData.preview,
          data: fileData.data
        });
        setCurrentAgent("Extraction");
        const data = await extractProductData({ data: fileData.data, mimeType: fileData.mimeType });
        setWorkflow(prev => ({ ...prev, productData: data }));
      }
    } catch (error) {
      console.error("File processing failed:", error);
      alert("Une erreur est survenue lors du traitement du fichier.");
    } finally {
      setIsProcessing(false);
      setCurrentAgent(null);
    }
  }, [workflow.mode]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 
      'image/*': [], 
      'application/pdf': [], 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [] 
    },
    disabled: workflow.step !== 'INPUT'
  });

  const resetWorkflow = () => {
    setWorkflow(prev => ({ mode: prev.mode, step: 'INPUT', productData: INITIAL_PRODUCT_DATA, id: undefined }));
    setValidationContext('');
    setSearchQuery('');
    setIntelligenceQuery('');
    setValidationFile(null);
    setIntelligenceFile(null);
    setSavedProductData(null);
    setNeedsReanalysis(false);
  };

  const manualSave = async () => {
    if (!user) {
      alert("Veuillez vous connecter pour enregistrer.");
      return;
    }
    setIsProcessing(true);
    try {
      await saveToFirebase(workflow);
      alert("Formation enregistrée avec succès !");
    } catch (error) {
      console.error("Manual save failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const isSaved = savedProductData && JSON.stringify(savedProductData) === JSON.stringify(workflow.productData);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center bg-white rounded-xl p-2 shadow-sm border border-slate-100">
            <span className="font-heading font-black text-xl tracking-tighter text-slate-900">NET<span className="text-primary">-INFO</span></span>
          </div>
          <div className="h-8 w-px bg-slate-200 mx-2"></div>
          <div>
            <h1 className="text-xl font-heading font-bold tracking-tight text-slate-900">Veille Commerciale</h1>
            <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Gouvernance Multi-Agent</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button 
              onClick={() => {
                setWorkflow({ mode: 'VALIDATION', step: 'INPUT', productData: INITIAL_PRODUCT_DATA });
                setValidationContext('');
                setValidationFile(null);
                setNeedsReanalysis(false);
                setActiveDashboard('FICHE');
              }}
              disabled={isProcessing}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                workflow.mode === 'VALIDATION' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
                isProcessing && "opacity-50 cursor-not-allowed"
              )}
            >
              Validation Produit
            </button>
            <button 
              onClick={() => {
                setWorkflow({ mode: 'INTELLIGENCE', step: 'INPUT', productData: INITIAL_PRODUCT_DATA });
                setIntelligenceQuery('');
                setIntelligenceFile(null);
                setActiveDashboard('VEILLE');
              }}
              disabled={isProcessing}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
                workflow.mode === 'INTELLIGENCE' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
                isProcessing && "opacity-50 cursor-not-allowed"
              )}
            >
              Veille Exploratoire
            </button>
          </div>
          {user && (
            <button 
              onClick={() => setActiveDashboard(prev => prev === 'HISTORIQUE' ? (workflow.mode === 'INTELLIGENCE' ? 'VEILLE' : 'FICHE') : 'HISTORIQUE')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                activeDashboard === 'HISTORIQUE' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <History size={14} /> Historique
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <p className="text-[10px] font-bold text-slate-900">{user.displayName}</p>
                <button onClick={logout} className="text-[8px] font-bold text-red-500 uppercase hover:underline">Déconnexion</button>
              </div>
              {user.photoURL && <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />}
            </div>
          ) : (
            <button 
              onClick={login}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <LogIn size={14} /> Connexion
            </button>
          )}
          {workflow.step !== 'INPUT' && (
            <button 
              onClick={resetWorkflow}
              className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} /> Nouvelle Veille
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          {/* Left Column: Persistent Product Sheet */}
          <div className={cn(
            "lg:col-span-4 space-y-6 transition-all duration-500",
            workflow.step === 'INPUT' ? "lg:col-span-7" : "lg:col-span-4"
          )}>
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 sticky top-24">
              {workflow.mode === 'VALIDATION' ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <FileText className="text-primary" /> Fiche Produit {isSaved && <Check size={16} className="text-green-500 inline-block ml-2" />}
                    </h2>
                    <div className="flex items-center gap-4">
                      {workflow.step === 'INPUT' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Auto-Analyse</span>
                          <button 
                            onClick={() => setAutoAnalyse(!autoAnalyse)}
                            className={cn(
                              "w-8 h-4 rounded-full transition-all relative",
                              autoAnalyse ? "bg-primary" : "bg-slate-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                              autoAnalyse ? "left-4.5" : "left-0.5"
                            )} />
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {workflow.step === 'INPUT' && !autoAnalyse && (
                          <button 
                            onClick={() => {
                              // Trigger manual analysis
                              setIsProcessing(true);
                              setNeedsReanalysis(false);
                              setCurrentAgent("Analyse rapide");
                              runAnalysisAgent(workflow.productData, validationContext)
                                .then(analysis => setWorkflow(prev => ({ ...prev, analysis, analysisId: Date.now().toString() })))
                                .catch(error => {
                                  console.error("Manual analysis failed:", error);
                                  if (error.message?.includes("RESOURCE_EXHAUSTED")) {
                                    setWorkflow(prev => ({ ...prev, error: "Quota API atteint. Veuillez patienter quelques minutes." }));
                                  }
                                })
                                .finally(() => {
                                  setIsProcessing(false);
                                  setCurrentAgent(null);
                                });
                            }}
                            disabled={isProcessing || !workflow.productData.title}
                            className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                            title="Analyser la fiche"
                          >
                            <Zap size={16} />
                          </button>
                        )}
                        {user && (
                          <button 
                            onClick={manualSave}
                            disabled={isProcessing || !workflow.productData.title}
                            className={cn(
                              "p-2 rounded-lg transition-all flex items-center gap-1",
                              isSaved ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary"
                            )}
                            title={isSaved ? "Enregistré" : "Enregistrer dans Firebase"}
                          >
                            {isSaved ? <Check size={16} /> : <Database size={16} />}
                          </button>
                        )}
                        {needsReanalysis && workflow.step !== 'INPUT' && (
                          <button 
                            onClick={startWorkflow}
                            disabled={isProcessing}
                            className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 transition-all text-xs font-bold flex items-center gap-1"
                            title="Refaire l'analyse avec les nouvelles données"
                          >
                            <RefreshCw size={14} /> Refaire l'analyse
                          </button>
                        )}
                        {isProcessing && (
                          <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase animate-pulse">
                            <RefreshCw size={12} className="animate-spin" /> {currentAgent ? `${currentAgent}...` : "Analyse..."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                    <div className="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
                      <div className="space-y-1 relative" ref={formationDropdownRef}>
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Titre de la formation (Interne)</label>
                          {workflow.analysis?.efficiency?.title !== undefined && (
                            <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.title))} />
                          )}
                        </div>
                        <div className="relative">
                          <input 
                            value={workflow.productData.title || ''}
                            onChange={(e) => {
                              handleInputChange('title', e.target.value);
                              setIsFormationDropdownOpen(true);
                            }}
                            onFocus={() => setIsFormationDropdownOpen(true)}
                            placeholder="Ex: Expert en Intelligence Artificielle"
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all font-medium text-sm",
                              getScoreBorder(workflow.analysis?.efficiency?.title)
                            )}
                          />
                          <AnimatePresence>
                            {isFormationDropdownOpen && formations.length > 0 && (
                              <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
                              >
                                {formations
                                  .filter(f => f.title.toLowerCase().includes(workflow.productData.title.toLowerCase()))
                                  .map((f, i) => (
                                    <button
                                      key={i}
                                      onClick={() => {
                                        setWorkflow(prev => ({ 
                                          ...prev, 
                                          productData: { ...INITIAL_PRODUCT_DATA, ...f },
                                          formationId: (f as any).id
                                        }));
                                        setIsFormationDropdownOpen(false);
                                      }}
                                      className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                                    >
                                      <p className="font-bold text-slate-800 text-sm">{f.title}</p>
                                      <p className="text-[10px] text-slate-400 uppercase">{f.duration} • {f.format}</p>
                                    </button>
                                  ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Standardized Fields */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Concept</label>
                          {workflow.analysis?.efficiency?.concept !== undefined && (
                            <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.concept))} />
                          )}
                        </div>
                        <textarea 
                          value={workflow.productData.concept || ''}
                          onChange={(e) => handleInputChange('concept', e.target.value)}
                          placeholder="Décrivez le concept global..."
                          className={cn(
                            "w-full h-20 px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all resize-none text-sm",
                            getScoreBorder(workflow.analysis?.efficiency?.concept)
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Pour qui (Cible)</label>
                            {workflow.analysis?.efficiency?.target !== undefined && (
                              <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.target))} />
                            )}
                          </div>
                          <input 
                            value={workflow.productData.target || ''}
                            onChange={(e) => handleInputChange('target', e.target.value)}
                            placeholder="Ex: Développeurs..."
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm",
                              getScoreBorder(workflow.analysis?.efficiency?.target)
                            )}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Pourquoi (Objectifs)</label>
                            {workflow.analysis?.efficiency?.why !== undefined && (
                              <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.why))} />
                            )}
                          </div>
                          <input 
                            value={workflow.productData.why || ''}
                            onChange={(e) => handleInputChange('why', e.target.value)}
                            placeholder="Ex: Acquisition de compétences..."
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm",
                              getScoreBorder(workflow.analysis?.efficiency?.why)
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Ce que le concept inclut</label>
                          {workflow.analysis?.efficiency?.includes !== undefined && (
                            <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.includes))} />
                          )}
                        </div>
                        <textarea 
                          value={workflow.productData.includes || ''}
                          onChange={(e) => handleInputChange('includes', e.target.value)}
                          placeholder="Détaillez le contenu..."
                          className={cn(
                            "w-full h-24 px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all resize-none text-sm",
                            getScoreBorder(workflow.analysis?.efficiency?.includes)
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Supports</label>
                            {workflow.analysis?.efficiency?.supports !== undefined && (
                              <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.supports))} />
                            )}
                          </div>
                          <input 
                            value={workflow.productData.supports || ''}
                            onChange={(e) => handleInputChange('supports', e.target.value)}
                            placeholder="Ex: PDF, Vidéos, Accès Lab..."
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm",
                              getScoreBorder(workflow.analysis?.efficiency?.supports)
                            )}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className={cn(
                              "text-[10px] font-bold uppercase",
                              !workflow.productData.format ? "text-red-400" : "text-slate-400"
                            )}>
                              Format {!workflow.productData.format && <span className="text-red-500">*</span>}
                            </label>
                            {workflow.analysis?.efficiency?.format !== undefined && (
                              <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.format))} />
                            )}
                          </div>
                          <select 
                            value={workflow.productData.format || ''}
                            onChange={(e) => handleInputChange('format', e.target.value)}
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm appearance-none",
                              !workflow.productData.format ? "border-red-200 bg-red-50/30" : getScoreBorder(workflow.analysis?.efficiency?.format)
                            )}
                          >
                            <option value="">Sélectionner un format</option>
                            <option value="bootcamp">Bootcamp</option>
                            <option value="formation certifiante">Formation certifiante</option>
                            <option value="formation diplômante">Formation diplômante</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Durée</label>
                            {workflow.analysis?.efficiency?.duration !== undefined && (
                              <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.duration))} />
                            )}
                          </div>
                          <input 
                            value={workflow.productData.duration || ''}
                            onChange={(e) => handleInputChange('duration', e.target.value)}
                            placeholder="Ex: 3 mois"
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm",
                              getScoreBorder(workflow.analysis?.efficiency?.duration)
                            )}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Références</label>
                            {workflow.analysis?.efficiency?.references !== undefined && (
                              <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.references))} />
                            )}
                          </div>
                          <input 
                            value={workflow.productData.references || ''}
                            onChange={(e) => handleInputChange('references', e.target.value)}
                            placeholder="Ex: Partenaires, Alumni..."
                            className={cn(
                              "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm",
                              getScoreBorder(workflow.analysis?.efficiency?.references)
                            )}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Différenciation Netinfo et DALL</label>
                          {workflow.analysis?.efficiency?.differentiation !== undefined && (
                            <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.differentiation))} />
                          )}
                        </div>
                        <textarea 
                          value={workflow.productData.differentiation || ''}
                          onChange={(e) => handleInputChange('differentiation', e.target.value)}
                          placeholder="Qu'est-ce qui nous distingue ?"
                          className={cn(
                            "w-full h-20 px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all resize-none text-sm",
                            getScoreBorder(workflow.analysis?.efficiency?.differentiation)
                          )}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Positionnement dans l’écosystème</label>
                          {workflow.analysis?.efficiency?.ecosystem !== undefined && (
                            <div className={cn("w-2 h-2 rounded-full", getScoreColor(workflow.analysis.efficiency.ecosystem))} />
                          )}
                        </div>
                        <input 
                          value={workflow.productData.ecosystem || ''}
                          onChange={(e) => handleInputChange('ecosystem', e.target.value)}
                          placeholder="Rôle dans l'écosystème..."
                          className={cn(
                            "w-full px-4 py-3 rounded-xl bg-slate-50 border focus:bg-white focus:ring-4 focus:ring-primary/80/5 transition-all text-sm",
                            getScoreBorder(workflow.analysis?.efficiency?.ecosystem)
                          )}
                        />
                      </div>

                      <div className="pt-4 border-t border-slate-100 space-y-4">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Informations Manuelles (Obligatoires)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Prix (TND)</label>
                            <input 
                              value={workflow.productData.price || ''}
                              onChange={(e) => handleInputChange('price', e.target.value)}
                              placeholder="Ex: 2500 DT"
                              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-4 focus:ring-primary/80/5 transition-all text-sm font-bold text-primary"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Région</label>
                            <input 
                              value={workflow.productData.region || ''}
                              onChange={(e) => handleInputChange('region', e.target.value)}
                              placeholder="Ex: Tunisie, Maghreb..."
                              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-4 focus:ring-primary/80/5 transition-all text-sm font-bold text-primary"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Labels et certifications</label>
                            <input 
                              value={workflow.productData.certifications || ''}
                              onChange={(e) => handleInputChange('certifications', e.target.value)}
                              placeholder="Ex: Qualiopi, ISO..."
                              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:ring-4 focus:ring-primary/80/5 transition-all text-sm font-bold text-primary"
                            />
                          </div>
                        </div>
                      </div>

                    {workflow.step === 'INPUT' && (
                      <div className="pt-4 space-y-4">
                        <div {...getRootProps()} className={cn(
                          "border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
                          isDragActive ? "border-primary bg-primary/10" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                        )}>
                          <input {...getInputProps()} />
                          <Upload size={20} className="text-primary" />
                          <p className="text-xs font-bold text-slate-700 text-center">Importer un document</p>
                        </div>

                        {validationFile && (
                          <div className="relative group p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-4">
                            {validationFile.preview ? (
                              <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                <img src={validationFile.preview} alt="Preview" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                <FileText size={24} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 truncate">{validationFile.name}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold">{validationFile.type.split('/')[1] || 'Fichier'}</p>
                            </div>
                            <button 
                              onClick={() => setValidationFile(null)}
                              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center justify-between ml-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Contexte Additionnel</label>
                            {validationContext.trim() && (
                              <button 
                                onClick={handleExtractFromText}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                title="Remplir la fiche à partir de ce texte"
                              >
                                <Zap size={10} /> Extraire les infos
                              </button>
                            )}
                          </div>
                          <textarea 
                            value={validationContext || ''}
                            onChange={(e) => setValidationContext(e.target.value)}
                            placeholder="Questions, doutes, hypothèses business ou texte brut de la formation à analyser..."
                            className="w-full h-24 px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-primary/80/20 transition-all resize-none text-sm"
                          />
                        </div>

                        {getMissingFields().length > 0 && (
                          <div className="p-4 bg-red-50 rounded-2xl border border-red-100 mb-4 animate-pulse">
                            <p className="text-[10px] font-bold text-red-600 uppercase mb-2 flex items-center gap-1">
                              <AlertTriangle size={14} /> Action requise : Complétez les champs obligatoires
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {getMissingFields().map((field, idx) => (
                                <span key={idx} className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-[10px] font-bold uppercase">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <button 
                          onClick={startWorkflow}
                          disabled={getMissingFields().length > 0 || isProcessing}
                          className="w-full py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30 hover:bg-primary-hover active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                        >
                          {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
                          {getMissingFields().length > 0 ? "Formulaire incomplet" : "Lancer la Veille Séquentielle"}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      <Search className="text-primary" /> Veille Exploratoire
                    </h2>
                    {isProcessing && (
                      <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase animate-pulse">
                        <RefreshCw size={12} className="animate-spin" /> {currentAgent ? `${currentAgent}...` : "Recherche..."}
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-6 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Explorez une question précise, une hypothèse ou une problématique marché (tendances, concurrence, prix, technologies) de manière indépendante.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Votre question ou hypothèse</label>
                      <textarea 
                        value={intelligenceQuery || ''}
                        onChange={(e) => setIntelligenceQuery(e.target.value)}
                        placeholder="Ex: Quelles sont les tendances de formation en IA générative pour 2024 en Tunisie ?"
                        className="w-full h-40 px-4 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all resize-none text-sm font-medium"
                      />
                    </div>

                    <div {...getRootProps()} className={cn(
                      "border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
                      isDragActive ? "border-primary bg-primary/10" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"
                    )}>
                      <input {...getInputProps()} />
                      <Upload size={20} className="text-primary" />
                      <p className="text-xs font-bold text-slate-700 text-center">Importer un document/image</p>
                    </div>

                    {intelligenceFile && (
                      <div className="relative group p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-4">
                        {intelligenceFile.preview ? (
                          <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                            <img src={intelligenceFile.preview} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <FileText size={24} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{intelligenceFile.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">{intelligenceFile.type.split('/')[1] || 'Fichier'}</p>
                        </div>
                        <button 
                          onClick={() => setIntelligenceFile(null)}
                          className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                    
                    <button 
                      onClick={() => runIntelligenceWorkflow(intelligenceQuery)}
                      disabled={isProcessing || (!intelligenceQuery.trim() && !intelligenceFile)}
                      className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:shadow-none"
                    >
                      {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                      Lancer la Veille Exploratoire
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Column: Workflow & Results */}
          <div className={cn(
            "transition-all duration-500",
            workflow.step === 'INPUT' ? "lg:col-span-5" : "lg:col-span-8"
          )}>
            <AnimatePresence mode="wait">
              {(workflow.step === 'INPUT' && activeDashboard !== 'HISTORIQUE') ? (
                <motion.div 
                  key="intro"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-8"
                >
                  {/* Hero Section */}
                  <div className="relative overflow-hidden bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-slate-200">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] -mr-32 -mt-32" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 blur-[100px] -ml-32 -mb-32" />
                    
                    <div className="relative z-10 max-w-2xl">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest mb-6">
                        <Zap size={12} className="text-primary" /> Intelligence Multi-Agent
                      </div>
                      <h2 className="text-4xl font-black mb-6 leading-[1.1] tracking-tight">
                        Gouvernance de Veille <br/>
                        <span className="text-primary">Automatisée</span>
                      </h2>
                      <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-lg">
                        Optimisez vos lancements produits grâce à une analyse séquentielle rigoureuse. Nos 4 agents IA collaborent pour identifier les risques, analyser la concurrence et valider votre stratégie.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {[
                          { label: 'Analyse de Risques', icon: AlertTriangle, color: 'text-orange-400' },
                          { label: 'Veille Concurrentielle', icon: Search, color: 'text-blue-400' },
                          { label: 'Optimisation Marketing', icon: Zap, color: 'text-primary' },
                          { label: 'Validation Finale', icon: ShieldCheck, color: 'text-green-400' },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-3 bg-white/5 p-4 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                            <item.icon size={18} className={item.color} />
                            <span className="text-xs font-bold">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Process Section */}
                  <div className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-10">
                      <div>
                        <h3 className="text-xl font-black text-slate-900">Structure de la Veille</h3>
                        <p className="text-xs text-slate-500 mt-1">Le parcours séquentiel de vos données à travers nos agents.</p>
                      </div>
                      <div className="h-px flex-1 bg-slate-100 mx-8 hidden md:block" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <FileText size={16} />
                          </div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Phase 1: Analyse de Fiche</h4>
                        </div>
                        
                        <div className="space-y-6 relative pl-4">
                          <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-100" />
                          {[
                            { step: '01', title: 'Extraction de Données', desc: 'Importez vos documents (PDF, Word, Images) ou saisissez les informations manuellement.' },
                            { step: '02', title: 'Diagnostic d\'Efficience', desc: 'L\'Agent d\'Analyse évalue la clarté, identifie les faiblesses et pose des hypothèses business.' },
                          ].map((item, i) => (
                            <div key={i} className="relative">
                              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-primary" />
                              <div className="pl-4">
                                <p className="text-[10px] font-black text-primary uppercase mb-1">{item.step}</p>
                                <p className="font-bold text-slate-800 text-sm">{item.title}</p>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <TrendingUp size={16} />
                          </div>
                          <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Phase 2: Veille Marché</h4>
                        </div>
                        
                        <div className="space-y-6 relative pl-4">
                          <div className="absolute left-0 top-2 bottom-2 w-px bg-slate-100" />
                          {[
                            { step: '03', title: 'Recherche & Benchmark', desc: 'L\'Agent de Recherche scanne le marché réel pour comparer les prix et identifier les concurrents.' },
                            { step: '04', title: 'Recommandations Créatives', desc: 'L\'Agent de Création propose des corrections marketing et des concepts de campagnes.' },
                            { step: '05', title: 'Gouvernance & Validation', desc: 'L\'Agent de Validation prend la décision finale basée sur l\'ensemble des rapports.' },
                          ].map((item, i) => (
                            <div key={i} className="relative">
                              <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-blue-500" />
                              <div className="pl-4">
                                <p className="text-[10px] font-black text-blue-500 uppercase mb-1">{item.step}</p>
                                <p className="font-bold text-slate-800 text-sm">{item.title}</p>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="workflow-results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8 pb-20"
                >
                  {/* Dashboard Switcher & Actions */}
                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full max-w-4xl mx-auto">
                    {workflow.mode !== 'INTELLIGENCE' ? (
                      <div className="flex p-1 bg-slate-100/80 backdrop-blur-md rounded-2xl w-full max-w-lg border border-slate-200/50 shadow-sm">
                        <button 
                          onClick={() => setActiveDashboard('FICHE')}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                            activeDashboard === 'FICHE' ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          <FileText size={14} /> Analyse de Fiche
                        </button>
                        <button 
                          onClick={() => setActiveDashboard('VEILLE')}
                          disabled={!workflow.search && !isProcessing}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                            activeDashboard === 'VEILLE' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700",
                            (!workflow.search && !isProcessing) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <TrendingUp size={14} /> Veille Commerciale
                        </button>
                        <button 
                          onClick={() => setActiveDashboard('MARKETING')}
                          disabled={!workflow.marketing && !isProcessing}
                          className={cn(
                            "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                            activeDashboard === 'MARKETING' ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-700",
                            (!workflow.marketing && !isProcessing) && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <Zap size={14} /> Veille Marketing
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        {/* Redundant buttons removed */}
                      </div>
                    )}

                    {activeDashboard !== 'HISTORIQUE' && (
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                          onClick={exportToPDF}
                          disabled={isExporting}
                          className="flex-1 md:flex-none px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                        >
                          {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                          {isExporting ? "Exportation..." : "Exporter PDF"}
                        </button>
                        
                        {user && (
                          <button
                            onClick={() => saveToFirebase(workflow)}
                            disabled={isSaving || (workflow.mode === 'VALIDATION' && (!workflow.analysis?.efficiency || Object.values(workflow.analysis.efficiency).some(s => s < 50) || !workflow.productData.region || !workflow.productData.certifications || !workflow.productData.price))}
                            className={cn(
                              "flex-1 md:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95",
                              (saveSuccess || (workflow.id && !needsReanalysis)) 
                                ? "bg-green-500 text-white" 
                                : (workflow.mode === 'VALIDATION' && (!workflow.analysis?.efficiency || Object.values(workflow.analysis.efficiency).some(s => s < 50) || !workflow.productData.region || !workflow.productData.certifications || !workflow.productData.price))
                                  ? "bg-slate-200 text-slate-400 cursor-not-allowed grayscale"
                                  : "bg-primary text-white hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20"
                            )}
                            title={
                              workflow.mode === 'VALIDATION' && (!workflow.analysis?.efficiency || Object.values(workflow.analysis.efficiency).some(s => s < 50) || !workflow.productData.region || !workflow.productData.certifications || !workflow.productData.price)
                                ? "Veuillez corriger les scores rouges et remplir les champs obligatoires (Prix, Région, Labels) avant de valider."
                                : "Valider et enregistrer la fiche produit"
                            }
                          >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : (saveSuccess || (workflow.id && !needsReanalysis)) ? <Check size={14} /> : <Database size={14} />}
                            {isSaving ? "Validation..." : (saveSuccess || (workflow.id && !needsReanalysis)) ? "Validé !" : "Valider la Fiche"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {activeDashboard !== 'HISTORIQUE' && workflow.mode !== 'INTELLIGENCE' && (
                    <div className="w-full max-w-4xl mx-auto h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ 
                          width: workflow.step === 'ANALYSIS' ? '20%' : 
                                 workflow.step === 'SEARCH' ? '40%' : 
                                 workflow.step === 'CREATION' ? '60%' : 
                                 workflow.step === 'VALIDATION' ? '80%' : '100%' 
                        }}
                        className={cn(
                          "h-full transition-all duration-1000 ease-out",
                          activeDashboard === 'FICHE' ? "bg-primary" : "bg-blue-600"
                        )}
                      />
                    </div>
                  )}

                  {/* Stepper */}
                  {activeDashboard !== 'HISTORIQUE' && workflow.mode !== 'INTELLIGENCE' && (
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex items-center justify-between overflow-x-auto sticky top-24 z-40 bg-white/90 backdrop-blur-sm">
                      {(activeDashboard === 'FICHE' ? [
                        { id: 'ANALYSIS', label: 'Analyse', icon: BarChart3 },
                      ] : [
                        { id: 'SEARCH', label: 'Recherche', icon: Search },
                        { id: 'CREATION', label: 'Création', icon: Zap },
                        { id: 'VALIDATION', label: 'Validation', icon: ShieldCheck },
                        { id: 'FINAL', label: 'Finalisation', icon: CheckCircle },
                      ]).map((s, i, arr) => {
                        const isActive = workflow.step === s.id;
                        const allSteps = ['ANALYSIS', 'SEARCH', 'CREATION', 'VALIDATION', 'FINAL'];
                        const isPast = allSteps.indexOf(workflow.step) > allSteps.indexOf(s.id);
                        
                        return (
                          <React.Fragment key={s.id}>
                            <div className={cn(
                              "flex flex-col items-center gap-2 min-w-[80px] transition-all",
                              isActive ? "scale-105" : "opacity-50"
                            )}>
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm",
                                isActive ? (activeDashboard === 'FICHE' ? "bg-primary" : "bg-blue-600") + " text-white shadow-primary/30" : 
                                isPast ? "bg-green-500 text-white" : "bg-slate-100 text-slate-400"
                              )}>
                                {isPast ? <CheckCircle size={18} /> : <s.icon size={18} />}
                              </div>
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-widest",
                                isActive ? (activeDashboard === 'FICHE' ? "text-primary" : "text-blue-600") : "text-slate-500"
                              )}>{s.label}</span>
                            </div>
                            {i < arr.length - 1 && (
                              <div className="flex-1 h-px bg-slate-200 mx-2 min-w-[10px]" />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}

                  {/* Results Content */}
                  <div id="workflow-results-content" className="space-y-6 pdf-export-content">
                    {showCampaignBuilder ? (
                      <CampaignBuilderView 
                        validation={workflow.validation!} 
                        onBack={() => setShowCampaignBuilder(false)} 
                      />
                    ) : activeDashboard === 'HISTORIQUE' ? (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                            <History className="text-slate-400" /> Historique des Analyses
                          </h2>
                          <div className="flex items-center gap-4">
                            <button 
                              onClick={fetchAnalyses}
                              className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                              title="Actualiser l'historique"
                            >
                              <RefreshCw size={14} />
                            </button>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                              {analyses.length} Analyses enregistrées
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                          {analyses.map((analysis) => (
                            <motion.div
                              key={analysis.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="group bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
                              onClick={() => loadAnalysis(analysis)}
                            >
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                    <FileText size={24} />
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-slate-800 group-hover:text-primary transition-colors">{analysis.title}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                        <Calendar size={10} /> {analysis.updatedAt?.toDate().toLocaleDateString()}
                                      </span>
                                      <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                        <Clock size={10} /> {analysis.updatedAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                      <span className="text-[10px] font-black text-primary/60 uppercase tracking-tighter ml-2">
                                        {analysis.mode === 'INTELLIGENCE' ? 'Veille Exploratoire' : 'Validation Produit'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                    analysis.step === 'FINAL' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                                  )}>
                                    {analysis.step}
                                  </div>
                                  <ChevronRight size={16} className="text-slate-300 group-hover:text-primary transition-all group-hover:translate-x-1" />
                                </div>
                              </div>
                            </motion.div>
                          ))}

                          {analyses.length === 0 && (
                            <div className="py-20 flex flex-col items-center justify-center text-center gap-4 bg-white rounded-3xl border border-dashed border-slate-200">
                              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                                <History size={32} />
                              </div>
                              <div>
                                <p className="font-bold text-slate-400">Aucun historique disponible</p>
                                <p className="text-xs text-slate-400 mt-1">Commencez une nouvelle analyse pour voir l'historique ici.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : workflow.mode === 'INTELLIGENCE' ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-8"
                      >
                        <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-200 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] -mr-32 -mt-32" />
                          
                          <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-8">
                              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                <Search size={24} />
                              </div>
                              <div>
                                <h2 className="text-2xl font-black text-slate-900">Résultat de la Veille</h2>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analyse Exploratoire</p>
                              </div>
                            </div>

                            <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed bg-slate-50/50 p-8 rounded-3xl border border-slate-100 mb-8">
                              <ReactMarkdown>{workflow.search?.results || ""}</ReactMarkdown>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {workflow.search?.trends && workflow.search.trends.length > 0 && (
                                <div className="space-y-4">
                                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp size={16} className="text-blue-500" /> Tendances Clés
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {workflow.search.trends.map((t, i) => (
                                      <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-bold border border-blue-100">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {workflow.search?.opportunities && workflow.search.opportunities.length > 0 && (
                                <div className="space-y-4">
                                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <Zap size={16} className="text-amber-500" /> Opportunités
                                  </h3>
                                  <ul className="space-y-2">
                                    {workflow.search.opportunities.map((o, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                                        {o}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {workflow.search?.groundingChunks && workflow.search.groundingChunks.length > 0 && (
                              <div className="mt-10 pt-10 border-t border-slate-100">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Sources Consultées</h3>
                                <div className="flex flex-wrap gap-3">
                                  {workflow.search.groundingChunks.map((chunk, i) => (
                                    chunk.web ? (
                                      <a 
                                        key={i}
                                        href={chunk.web.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:border-primary hover:text-primary transition-all"
                                      >
                                        <ExternalLink size={12} />
                                        <span className="max-w-[150px] truncate">{chunk.web.title}</span>
                                      </a>
                                    ) : null
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <>
                        {/* Dashboard 1: Analyse de Fiche */}
                        {activeDashboard === 'FICHE' && (
                          <div className="grid grid-cols-1 gap-6">
                            {/* Analysis Column */}
                            <div className="space-y-6">
                              {/* Analysis Agent Output */}
                              {workflow.analysis ? (
                                <AgentCard 
                                  title="Agent 1 — Analyse d'Efficience" 
                                  icon={BarChart3} 
                                  color="primary"
                                  extra={
                                    <button 
                                      onClick={() => setShowSourceData(!showSourceData)}
                                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                                    >
                                      <FileText size={12} /> {showSourceData ? "Masquer la fiche" : "Voir la fiche source"}
                                    </button>
                                  }
                                >
                                <div className="space-y-6">
                                  {showSourceData && (
                                    <motion.div 
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      className="bg-white rounded-2xl p-6 border border-slate-200 shadow-inner mb-6 overflow-hidden"
                                    >
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Titre de la Formation</label>
                                            <p className={cn(
                                              "text-sm font-bold",
                                              getScoreTextColor(workflow.analysis?.efficiency?.title)
                                            )}>{workflow.productData.title}</p>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Concept</label>
                                            <p className="text-xs text-slate-600 leading-relaxed">{workflow.productData.concept}</p>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Pour qui</label>
                                            <p className="text-xs text-slate-600 leading-relaxed">{workflow.productData.target}</p>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Pourquoi</label>
                                            <p className="text-xs text-slate-600 leading-relaxed">{workflow.productData.why}</p>
                                          </div>
                                        </div>
                                        <div className="space-y-4">
                                          <div className="grid grid-cols-2 gap-4">
                                            <div>
                                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Format</label>
                                              <p className="text-xs font-bold text-primary">{workflow.productData.format}</p>
                                            </div>
                                            <div>
                                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Durée</label>
                                              <p className="text-xs font-bold text-slate-700">{workflow.productData.duration}</p>
                                            </div>
                                          </div>
                                          <div>
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Prix & Région & Labels</label>
                                            <p className="text-xs text-slate-600">{workflow.productData.price} • {workflow.productData.region} • {workflow.productData.certifications}</p>
                                          </div>
                                          <button 
                                            onClick={() => setWorkflow(prev => ({ ...prev, step: 'INPUT' }))}
                                            className="w-full py-2 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                          >
                                            <RefreshCw size={12} /> Modifier cette fiche
                                          </button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                  <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10">
                                    <div className="flex items-center gap-2 mb-6">
                                      <BarChart3 className="text-primary" size={20} />
                                      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Diagnostic d'Efficience</h4>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                                      {workflow.analysis?.efficiency && Object.entries(workflow.analysis.efficiency).map(([key, score]) => {
                                        const labels: Record<string, string> = {
                                          title: "Titre",
                                          concept: "Concept",
                                          target: "Pour qui",
                                          why: "Pourquoi",
                                          includes: "Contenu",
                                          supports: "Supports",
                                          format: "Format",
                                          duration: "Durée",
                                          references: "Références",
                                          differentiation: "Différence",
                                          ecosystem: "Écosystème"
                                        };
                                        return (
                                          <div key={key} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md hover:border-primary/20">
                                            <div className="relative">
                                              <svg className="w-12 h-12 transform -rotate-90">
                                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-slate-100" />
                                                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" 
                                                  strokeDasharray={125.6} 
                                                  strokeDashoffset={125.6 - (125.6 * (score || 0)) / 100}
                                                  className={cn(
                                                    "transition-all duration-1000 ease-out",
                                                    score && score >= 80 ? "text-green-500" : score && score >= 50 ? "text-amber-500" : "text-red-500"
                                                  )} 
                                                />
                                              </svg>
                                              <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[10px] font-black text-slate-700">{score || 0}%</span>
                                              </div>
                                            </div>
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider text-center">{labels[key] || key}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    
                                    <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
                                      <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                                      <p className="text-sm text-slate-700 leading-relaxed italic pl-2">"{workflow.analysis.diagnostic}"</p>
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <ListSection title="Forces" items={workflow.analysis.strengths} color="green" />
                                      <ListSection title="Faiblesses" items={workflow.analysis.weaknesses} color="red" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <ListSection title="Hypothèses" items={workflow.analysis.hypotheses} color="blue" />
                                      <ListSection title="Risques" items={workflow.analysis.risks} color="orange" />
                                    </div>
                                  </div>
                                </div>
                              </AgentCard>
                            ) : (
                              <div className="bg-white rounded-3xl p-12 border border-dashed border-slate-300 flex flex-col items-center justify-center text-center gap-4">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                                  <BarChart3 size={32} />
                                </div>
                                <div>
                                  <h3 className="font-bold text-slate-400">Analyse en attente</h3>
                                  <p className="text-xs text-slate-400 mt-1">L'Agent d'Analyse n'a pas encore démarré.</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                        {/* Dashboard 2: Veille Commerciale */}
                        {activeDashboard === 'VEILLE' && (
                          <>
                            {/* Search Agent Output */}
                            {workflow.search && (
                              <AgentCard 
                                title="Agent 2 — Recherche & Veille" 
                                icon={Search} 
                                color="blue"
                              >
                                <div className="space-y-6">
                                  <div className="prose prose-sm max-w-none text-slate-700 bg-blue-50/30 p-6 rounded-2xl border border-blue-100/50">
                                    <ReactMarkdown>{workflow.search.results}</ReactMarkdown>
                                  </div>
                                  
                                  <div>
                                    <div className="flex items-center justify-between mb-3">
                                      <h4 className="text-xs font-bold text-slate-500 uppercase">Benchmark Prix & Marché</h4>
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-black uppercase tracking-tighter">Sources de Crédibilité</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      {workflow.search.benchmarks.map((b, i) => {
                                        const isValidUrl = b.source?.startsWith('http');
                                        return (
                                          <div key={i} className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm hover:border-blue-200 transition-all">
                                            <p className="text-xs font-bold text-slate-800 line-clamp-1">{b.name}</p>
                                            <p className="text-lg font-black text-blue-600">{b.price}</p>
                                            {isValidUrl ? (
                                              <a 
                                                href={b.source} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[10px] text-blue-400 hover:text-blue-600 flex items-center gap-1 mt-1 font-bold"
                                              >
                                                <ExternalLink size={10} /> Voir la source
                                              </a>
                                            ) : (
                                              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 italic">
                                                {b.source || "Source non spécifiée"}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>

                                  {workflow.search.competitors && workflow.search.competitors.length > 0 && (
                                    <div>
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase">Analyse Concurrentielle</h4>
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[8px] font-black uppercase tracking-tighter">Concurrents Directs</span>
                                      </div>
                                      <div className="grid grid-cols-1 gap-4">
                                        {workflow.search.competitors.map((comp, i) => (
                                          <div key={i} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                                            <div className="flex items-center justify-between mb-3">
                                              <p className="text-sm font-black text-slate-800">{comp.name}</p>
                                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{comp.priceRange}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                              <div>
                                                <p className="text-[9px] font-bold text-green-600 uppercase mb-1">Forces</p>
                                                <ul className="space-y-1">
                                                  {comp.strengths.map((s, j) => (
                                                    <li key={j} className="text-[10px] text-slate-600 flex items-start gap-1">
                                                      <span className="text-green-500 mt-0.5">•</span> {s}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                              <div>
                                                <p className="text-[9px] font-bold text-red-600 uppercase mb-1">Faiblesses</p>
                                                <ul className="space-y-1">
                                                  {comp.weaknesses.map((w, j) => (
                                                    <li key={j} className="text-[10px] text-slate-600 flex items-start gap-1">
                                                      <span className="text-red-500 mt-0.5">•</span> {w}
                                                    </li>
                                                  ))}
                                                </ul>
                                              </div>
                                            </div>
                                            {comp.url && comp.url.startsWith('http') && (
                                              <a 
                                                href={comp.url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[9px] text-blue-400 hover:text-blue-600 flex items-center gap-1 mt-3 font-bold"
                                              >
                                                <ExternalLink size={10} /> Visiter le site
                                              </a>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {workflow.search.groundingChunks && workflow.search.groundingChunks.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Index des Sources Web</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {workflow.search.groundingChunks.map((chunk, i) => (
                                          chunk.web ? (
                                            <a 
                                              key={i}
                                              href={chunk.web.uri}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="px-3 py-1.5 bg-white border border-slate-100 rounded-lg text-[10px] font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all flex items-center gap-2 shadow-sm"
                                            >
                                              <LinkIcon size={12} className="text-blue-400" />
                                              {chunk.web.title}
                                            </a>
                                          ) : null
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <div className="grid grid-cols-2 gap-4">
                                    <ListSection title="Tendances" items={workflow.search.trends} color="blue" />
                                    <ListSection title="Menaces" items={workflow.search.threats} color="red" />
                                  </div>
                                </div>
                              </AgentCard>
                            )}

                            {/* Creation Agent Output */}
                            {workflow.creation && (
                              <AgentCard 
                                title="Agent 3 — Création & Recommandation" 
                                icon={Zap} 
                                color="amber"
                              >
                                <div className="space-y-6">
                                  <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100">
                                    <div className="flex items-center justify-between mb-4">
                                      <h4 className="text-sm font-bold text-amber-800 flex items-center gap-2">
                                        <FileText size={18} /> Fiche Produit Corrigée
                                      </h4>
                                    </div>
                                    <div className="space-y-4">
                                      <div>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase">Titre Optimisé</p>
                                        <p className="text-sm font-bold text-slate-800">{workflow.creation.correctedFiche?.title}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase">Concept Optimisé</p>
                                        <p className="text-sm text-slate-700 leading-relaxed">{workflow.creation.correctedFiche.concept}</p>
                                      </div>
                                      <div className="grid grid-cols-3 gap-4">
                                        <div>
                                          <p className="text-[10px] font-bold text-amber-600 uppercase">Format Recommandé</p>
                                          <p className="text-sm font-bold text-slate-800">{workflow.creation.correctedFiche.format}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-bold text-amber-600 uppercase">Durée Idéale</p>
                                          <p className="text-sm font-bold text-slate-800">{workflow.creation.correctedFiche.duration}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-bold text-amber-600 uppercase">Prix</p>
                                          <p className="text-sm font-bold text-slate-800">{workflow.productData.price}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </AgentCard>
                            )}

                            {/* Validation Agent Output */}
                            {workflow.validation && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={cn(
                                  "rounded-3xl p-8 text-white shadow-xl relative overflow-hidden",
                                  workflow.validation.decision === 'VALIDATED' ? "bg-green-600" :
                                  workflow.validation.decision === 'UPDATE_REQUIRED' ? "bg-amber-500" : "bg-red-600"
                                )}
                              >
                                <div className="relative z-10">
                                  <div className="flex items-center justify-between mb-6">
                                    <span className="text-xs font-bold uppercase tracking-widest opacity-80">Agent 4 — Validation Finale</span>
                                    <ShieldCheck size={24} />
                                  </div>
                                  
                                  <div className="flex items-center gap-3 mb-4">
                                    {workflow.validation.decision === 'VALIDATED' ? <CheckCircle size={40} /> :
                                     workflow.validation.decision === 'UPDATE_REQUIRED' ? <RefreshCw size={40} /> : <XCircle size={40} />}
                                    <h3 className="text-3xl font-black">
                                      {workflow.validation.decision === 'VALIDATED' ? 'VALIDÉ' :
                                       workflow.validation.decision === 'UPDATE_REQUIRED' ? 'À RÉVISER' : 'REFUSÉ'}
                                    </h3>
                                  </div>

                                  <p className="text-sm opacity-90 leading-relaxed mb-6">
                                    {workflow.validation.justification}
                                  </p>

                                  {workflow.validation.decision === 'VALIDATED' && (
                                    <button 
                                      onClick={() => setShowCampaignBuilder(true)}
                                      className="w-full py-4 bg-white text-green-600 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-green-50 transition-all shadow-lg"
                                    >
                                      <TrendingUp size={18} /> Alimenter Campaign Builder
                                    </button>
                                  )}
                                </div>
                                <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                              </motion.div>
                            )}
                          </>
                        )}

                        {/* Dashboard 3: Veille Marketing */}
                        {activeDashboard === 'MARKETING' && (
                          <>
                            {workflow.marketing && (
                              <VeilleMarketingDashboard marketing={workflow.marketing} />
                            )}
                          </>
                        )}

                        {/* Processing State */}
                        {isProcessing && (
                          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center gap-4">
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                              <RefreshCw className="animate-spin" size={32} />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-800">Agent en cours...</h3>
                              <p className="text-xs text-slate-500 mt-1">Le système respecte la gouvernance séquentielle.</p>
                            </div>
                          </div>
                        )}

                        {/* Error State */}
                        {workflow.error && (
                          <div className="bg-red-50 rounded-3xl p-6 border border-red-100 text-red-600">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertTriangle size={20} />
                              <h3 className="font-bold">Erreur Système</h3>
                            </div>
                            <p className="text-xs opacity-80">
                              {(() => {
                                try {
                                  const parsed = JSON.parse(workflow.error);
                                  if (parsed.error) return parsed.error;
                                  return workflow.error;
                                } catch (e) {
                                  return workflow.error;
                                }
                              })()}
                            </p>
                            <div className="flex gap-3 mt-4">
                              <button 
                                onClick={resetWorkflow}
                                className="flex-1 py-2 bg-white/20 text-white rounded-xl text-xs font-bold hover:bg-white/30 transition-all"
                              >
                                Réinitialiser
                              </button>
                              {workflow.error.includes("Quota") && (
                                <button 
                                  onClick={() => {
                                    setWorkflow(prev => ({ ...prev, error: undefined }));
                                    if (workflow.step === 'INPUT') {
                                      // Trigger manual analysis
                                      startWorkflow();
                                    } else {
                                      startWorkflow();
                                    }
                                  }}
                                  className="flex-1 py-2 bg-white text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                                >
                                  Réessayer
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-slate-200 flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-primary" /> Gouvernance Stricte</span>
          <span className="flex items-center gap-1"><BarChart3 size={12} className="text-primary" /> Analyse Séquentielle</span>
          <span className="flex items-center gap-1"><Search size={12} className="text-primary" /> Veille Marché Réelle</span>
        </div>
        <div>Système Intelligent de Veille Commerciale v2.0</div>
      </footer>

      {/* Hidden Full Report for PDF Export */}
      <div id="full-report-content" style={{ display: 'none' }}>
        <FullReport workflow={workflow} />
      </div>
    </div>
  );
}

function FullReport({ workflow }: { workflow: WorkflowState }) {
  return (
    <div className="p-10 bg-slate-50 space-y-10" id="full-report-root">
      <style dangerouslySetInnerHTML={{ __html: `
        #full-report-root {
          color: #0f172a !important;
          background-color: #f8fafc !important;
        }
        #full-report-root .text-slate-900 { color: #0f172a !important; }
        #full-report-root .text-slate-800 { color: #1e293b !important; }
        #full-report-root .text-slate-700 { color: #334155 !important; }
        #full-report-root .text-slate-600 { color: #475569 !important; }
        #full-report-root .text-slate-500 { color: #64748b !important; }
        #full-report-root .text-slate-400 { color: #94a3b8 !important; }
        #full-report-root .bg-white { background-color: #ffffff !important; }
        #full-report-root .bg-slate-50 { background-color: #f8fafc !important; }
        #full-report-root .bg-slate-100 { background-color: #f1f5f9 !important; }
        #full-report-root .border-slate-200 { border-color: #e2e8f0 !important; }
        #full-report-root .border-slate-100 { border-color: #f1f5f9 !important; }
        #full-report-root .text-primary { color: #2ACBC6 !important; }
        #full-report-root .border-primary { border-color: #2ACBC6 !important; }
        #full-report-root .text-blue-600 { color: #2563eb !important; }
        #full-report-root .text-amber-600 { color: #d97706 !important; }
        #full-report-root .text-green-600 { color: #16a34a !important; }
        #full-report-root .bg-green-100 { background-color: #dcfce7 !important; }
        #full-report-root .text-green-700 { color: #15803d !important; }
        #full-report-root .bg-amber-100 { background-color: #fef3c7 !important; }
        #full-report-root .text-amber-700 { color: #b45309 !important; }
        #full-report-root .bg-red-100 { background-color: #fee2e2 !important; }
        #full-report-root .text-red-700 { color: #b91c1c !important; }
        #full-report-root .bg-green-50 { background-color: #f0fdf4 !important; }
        #full-report-root .bg-red-50 { background-color: #fef2f2 !important; }
        #full-report-root .bg-blue-50 { background-color: #eff6ff !important; }
        #full-report-root .bg-orange-50 { background-color: #fff7ed !important; }
        #full-report-root .bg-amber-50 { background-color: #fffbeb !important; }
        #full-report-root .bg-primary\\/10 { background-color: #e9f9f9 !important; }
        #full-report-root .bg-primary\\/5 { background-color: #f4fdfd !important; }
        #full-report-root .bg-blue-50\\/30 { background-color: #f8fbff !important; }
        #full-report-root .border-primary\\/10 { border-color: #e9f9f9 !important; }
        #full-report-root .border-primary\\/20 { border-color: #d5f5f4 !important; }
        #full-report-root .border-blue-100\\/50 { border-color: #edf4fe !important; }
        #full-report-root .bg-green-100 { background-color: #dcfce7 !important; }
        #full-report-root .bg-amber-100 { background-color: #fef3c7 !important; }
        #full-report-root .bg-red-100 { background-color: #fee2e2 !important; }
        #full-report-root .bg-blue-100 { background-color: #dbeafe !important; }
        #full-report-root .text-green-700 { color: #15803d !important; }
        #full-report-root .text-amber-700 { color: #b45309 !important; }
        #full-report-root .text-red-700 { color: #b91c1c !important; }
        #full-report-root .text-blue-700 { color: #1d4ed8 !important; }
        #full-report-root .text-slate-300 { color: #cbd5e1 !important; }
        #full-report-root .bg-slate-200 { background-color: #e2e8f0 !important; }
        #full-report-root .bg-slate-300 { background-color: #cbd5e1 !important; }
        #full-report-root .bg-slate-400 { background-color: #94a3b8 !important; }
        #full-report-root .bg-slate-500 { background-color: #64748b !important; }
        #full-report-root .bg-slate-600 { background-color: #475569 !important; }
        #full-report-root .bg-slate-700 { background-color: #334155 !important; }
        #full-report-root .bg-slate-800 { background-color: #1e293b !important; }
        #full-report-root .bg-slate-900 { background-color: #0f172a !important; }
      ` }} />
      <div className="border-b-4 border-primary pb-6">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Rapport de Veille Commerciale</h1>
        <p className="text-slate-500 font-bold uppercase tracking-widest">Généré par Vigilance IA — {new Date().toLocaleDateString()}</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
          <FileText /> Informations de Base
        </h2>
        <div className="grid grid-cols-2 gap-6 bg-white p-6 rounded-2xl border border-slate-200">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Titre</p>
            <p className="text-lg font-bold">{workflow.productData.title}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Format</p>
              <p className="text-sm font-bold">{workflow.productData.format}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Prix</p>
              <p className="text-sm font-bold">{workflow.productData.price}</p>
            </div>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Concept</p>
            <p className="text-sm text-slate-600">{workflow.productData.concept}</p>
          </div>
        </div>
      </section>

      {workflow.analysis && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
            <BarChart3 /> Analyse d'Efficience
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <p className="text-sm text-slate-700 italic mb-6">"{workflow.analysis.diagnostic}"</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <ListSection title="Forces" items={workflow.analysis.strengths} color="green" />
              <ListSection title="Faiblesses" items={workflow.analysis.weaknesses} color="red" />
              <ListSection title="Hypothèses" items={workflow.analysis.hypotheses} color="blue" />
              <ListSection title="Risques" items={workflow.analysis.risks} color="orange" />
            </div>
          </div>
        </section>
      )}

      {workflow.search && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
            <Search /> Veille Marché & Benchmark
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-6">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{workflow.search.results}</ReactMarkdown>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {workflow.search.benchmarks.map((b, i) => (
                <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-bold text-slate-800">{b.name}</p>
                  <p className="text-xl font-black text-blue-600">{b.price}</p>
                  <p className="text-[10px] text-slate-400 truncate">{b.source}</p>
                </div>
              ))}
            </div>

            {workflow.search.competitors && workflow.search.competitors.length > 0 && (
              <div className="mt-8 space-y-4">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b pb-2">Analyse de la Concurrence Directe</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workflow.search.competitors.map((comp, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex justify-between items-center mb-3">
                        <p className="font-bold text-slate-900">{comp.name}</p>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded">{comp.priceRange}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-[10px]">
                        <div>
                          <p className="font-bold text-green-600 uppercase mb-1">Forces</p>
                          <ul className="list-disc list-inside text-slate-600">
                            {comp.strengths.map((s, j) => <li key={j}>{s}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="font-bold text-red-600 uppercase mb-1">Faiblesses</p>
                          <ul className="list-disc list-inside text-slate-600">
                            {comp.weaknesses.map((w, j) => <li key={j}>{w}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {workflow.creation && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-amber-600 flex items-center gap-2">
            <Zap /> Recommandations Stratégiques
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-8">
            <ListSection title="Conseils Marketing" items={workflow.creation.marketingRecommendations} color="amber" />
            <ListSection title="Conseils Campagne" items={workflow.creation.campaignAdvice} color="primary" />
          </div>
        </section>
      )}

      {workflow.validation && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-green-600 flex items-center gap-2">
            <ShieldCheck /> Validation Finale
          </h2>
          <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest",
                workflow.validation.decision === 'VALIDATED' ? "bg-green-100 text-green-700" :
                workflow.validation.decision === 'UPDATE_REQUIRED' ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              )}>
                {workflow.validation.decision}
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{workflow.validation.justification}</p>
          </div>
        </section>
      )}
    </div>
  );
}

function AgentCard({ title, icon: Icon, color, children, extra }: { title: string, icon: any, color: string, children: React.ReactNode, extra?: React.ReactNode }) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary border-primary/20",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    green: "bg-green-50 text-green-600 border-green-100",
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", colorClasses[color])}>
            <Icon size={20} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        </div>
        {extra}
      </div>
      {children}
    </motion.div>
  );
}

function ListSection({ title, items, color }: { title: string, items: string[], color: string }) {
  const colorClasses: Record<string, string> = {
    green: "text-green-600 bg-green-50",
    red: "text-red-600 bg-red-50",
    blue: "text-blue-600 bg-blue-50",
    orange: "text-orange-600 bg-orange-50",
    primary: "text-primary bg-primary/10",
    amber: "text-amber-600 bg-amber-50",
  };

  return (
    <div>
      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", colorClasses[color])} />
            <span className="text-xs text-slate-600 leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CampaignBuilderView({ validation, onBack }: { validation: ValidationAgentOutput, onBack: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="text-primary" /> Campaign Builder
        </h2>
        <button 
          onClick={onBack}
          className="text-xs font-bold text-slate-500 hover:text-primary transition-colors"
        >
          Retour au rapport
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-500" /> Fiche Validée
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Titre</p>
              <p className="text-sm font-bold">{validation.finalFiche?.title}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Concept</p>
              <p className="text-xs text-slate-600 leading-relaxed">{validation.finalFiche.concept}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Format</p>
                <p className="text-sm font-bold">{validation.finalFiche.format}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Durée</p>
                <p className="text-sm font-bold">{validation.finalFiche.duration}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Prix</p>
                <p className="text-sm font-bold">{validation.finalFiche.price}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Zap size={18} className="text-amber-500" /> Stratégie de Campagne
          </h3>
          <div className="space-y-4">
            {validation.validatedRecommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center text-primary shrink-0 text-[10px] font-bold">
                  {i + 1}
                </div>
                <p className="text-xs text-slate-700">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-primary rounded-3xl p-8 text-white shadow-xl">
        <h3 className="text-xl font-bold mb-4">Prochaines Étapes</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 bg-white/10 rounded-2xl border border-white/10 hover:bg-white/20 transition-all text-left">
            <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Ads</p>
            <p className="font-bold">Générer des copies publicitaires</p>
          </button>
          <button className="p-4 bg-white/10 rounded-2xl border border-white/10 hover:bg-white/20 transition-all text-left">
            <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Emailing</p>
            <p className="font-bold">Séquence de prospection</p>
          </button>
          <button className="p-4 bg-white/10 rounded-2xl border border-white/10 hover:bg-white/20 transition-all text-left">
            <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Social</p>
            <p className="font-bold">Planning de posts</p>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function VeilleMarketingDashboard({ marketing }: { marketing: MarketingAgentOutput }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Social Monitoring */}
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Monitoring Réseaux Sociaux</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Leaders d'opinion & Flux</p>
            </div>
          </div>
          <div className="space-y-6">
            {marketing.socialMonitoring?.map((platform, i) => (
              <div key={i} className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{platform.platform}</h4>
                <div className="space-y-3">
                  {platform.latestPosts?.map((post, j) => (
                    <div key={j} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-purple-200 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-800 text-xs">{post.author}</span>
                        <span className="text-[10px] text-slate-400">{post.date}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-3">{post.content}</p>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full text-[8px] font-bold uppercase">
                          {typeof post.engagement === 'object' ? `${post.engagement.likes} likes • ${post.engagement.shares} shares` : post.engagement}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sentiment Analysis */}
        <div className="space-y-8">
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600">
                <CheckCircle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Analyse de Sentiment</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Voix des étudiants & pros</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6 mb-8">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    className="text-slate-100"
                    strokeDasharray="100, 100"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={cn(
                      marketing.sentimentAnalysis.overall === 'POSITIVE' ? "text-green-500" : 
                      marketing.sentimentAnalysis.overall === 'NEGATIVE' ? "text-red-500" : "text-amber-500"
                    )}
                    strokeDasharray={`${marketing.sentimentAnalysis.score}, 100`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-800">{marketing.sentimentAnalysis.score}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 mb-1">Sentiment Global</p>
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                  marketing.sentimentAnalysis.overall === 'POSITIVE' ? "bg-green-100 text-green-600" : 
                  marketing.sentimentAnalysis.overall === 'NEGATIVE' ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                )}>
                  {marketing.sentimentAnalysis.overall}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Étudiants</h4>
                <ul className="space-y-2">
                  {marketing.sentimentAnalysis.studentFeedback?.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 flex gap-2">
                      <span className="text-green-500">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Professionnels</h4>
                <ul className="space-y-2">
                  {marketing.sentimentAnalysis.proFeedback?.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 flex gap-2">
                      <span className="text-blue-500">•</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* News & Trends */}
          <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Nouveautés & Tendances</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Innovation pédagogique</p>
              </div>
            </div>
            <div className="space-y-4">
              {marketing.newsAndTrends?.map((trend, i) => (
                <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-sm mb-1">{trend.title}</h4>
                  <p className="text-xs text-slate-600 mb-2">{trend.description}</p>
                  <span className="text-[10px] text-primary font-bold">{trend.source}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content Recommendations */}
      <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Recommandations de Contenu</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Génération d'idées & Stratégie</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {marketing.contentRecommendations?.map((rec, i) => (
            <div key={i} className="bg-white/5 border border-white/10 p-6 rounded-3xl hover:bg-white/10 transition-all group">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-primary/20 text-primary rounded-full text-[8px] font-black uppercase tracking-widest">
                  {rec.format}
                </span>
                <ArrowRight size={14} className="text-white/20 group-hover:text-primary transition-colors" />
              </div>
              <h4 className="font-bold text-white text-sm mb-2">{rec.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{rec.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
