/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  UserCircle2, 
  Globe2, 
  Palmtree, 
  ScrollText, 
  PenLine, 
  Layers, 
  RefreshCcw, 
  Settings2,
  ChevronRight,
  Loader2,
  Download,
  Copy,
  Check,
  Plus,
  Trash2,
  History,
  Sparkles,
  LogOut,
  LogIn,
  Smartphone,
  Mail,
  Key,
  Hash,
  ArrowLeft,
  MapPin,
  CheckCircle2,
  Flag,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  generateChapter, 
  generateBatch, 
  regenerateChapter, 
  type NovelConfig, 
  type ChapterParams,
  type BatchParams,
  type RegenParams
} from './lib/gemini';
import { auth, googleProvider, RecaptchaVerifier, signInWithPhoneNumber } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, type User, type ConfirmationResult } from 'firebase/auth';
import { projectService, type Project, type Character, type SavedChapter, type Environment } from './services/novelService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'character' | 'environment' | 'world' | 'style' | 'outline' | 'write' | 'history';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('character');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Current active project
  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  const [currentOutput, setCurrentOutput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [writeMode, setWriteMode] = useState<'single' | 'batch' | 'regen'>('single');
  const [batchParams, setBatchParams] = useState<BatchParams>({
    start: 1,
    end: 3,
    total: 3,
    batchSynopsisList: '',
  });
  const [regenParams, setRegenParams] = useState<RegenParams>({
    chapterNum: 1,
    regenNote: '',
    issue: '',
  });
  const [chapterParams, setChapterParams] = useState<ChapterParams>({
    chapterNum: 1,
    chapterTitle: '',
    synopsis: '',
  });
  const [copied, setCopied] = useState(false);
  const [lastGeneratedChapterId, setLastGeneratedChapterId] = useState<string | null>(null);

  const [authType, setAuthType] = useState<'email' | 'phone'>('email');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [authError, setAuthError] = useState('');

  // Auth monitoring
  useEffect(() => {
    import('./lib/firebase').then(({ testConnection }) => testConnection());
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const setupRecaptcha = () => {
    if ((window as any).recaptchaVerifier) return;
    (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        console.log('Recaptcha resolved');
      }
    });
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setupRecaptcha();
    const verifier = (window as any).recaptchaVerifier;
    
    // Quick format check (basic)
    if (!phoneNumber.startsWith('+')) {
      return setAuthError('请使用国际格式，例如 +8613800138000');
    }

    try {
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmationResult(result);
      setIsCodeSent(true);
    } catch (error: any) {
      console.error(error);
      setAuthError('发送验证码失败，请检查号码或稍后再试');
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setAuthError('');
    try {
      await confirmationResult.confirm(verificationCode);
    } catch (error: any) {
      setAuthError('验证码错误或已过期');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (authMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.code === 'auth/weak-password' ? '密码太弱了（至少6位）' :
                  error.code === 'auth/email-already-in-use' ? '该邮箱已被注册' :
                  error.code === 'auth/invalid-email' ? '邮箱格式无效' :
                  error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' ? '邮箱或密码错误' :
                  '操作失败，请检查输入';
      setAuthError(msg);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
    }
  };

  // Load projects from Firestore
  useEffect(() => {
    if (user) {
      loadProjects();
    } else {
      setProjects([]);
      setActiveProjectId(null);
    }
  }, [user]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const pList = await projectService.getProjects();
      setProjects(pList);
      if (pList.length > 0) {
        // If current active ID is invalid or not set, pick the first one
        if (!activeProjectId || !pList.find(p => p.id === activeProjectId)) {
          setActiveProjectId(pList[0].id);
        }
      } else {
        setActiveProjectId(null);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Fetch subcollections when project changes
  useEffect(() => {
    if (activeProjectId && activeProject && !activeProject.characters) {
      loadProjectDetails(activeProjectId);
    }
  }, [activeProjectId]);

  const loadProjectDetails = async (pid: string) => {
    const [characters, environments, chapters] = await Promise.all([
      projectService.getCharacters(pid),
      projectService.getEnvironments(pid),
      projectService.getChapters(pid)
    ]);
    setProjects(prev => prev.map(p => p.id === pid ? { ...p, characters, environments, chapters } : p));
  };

  const updateActiveProject = async (updater: (p: Project) => Project) => {
    const updated = projects.map(p => {
      if (p.id === activeProjectId) {
        const newP = updater(p);
        // Persist change to Firestore (throttled/debounced would be better in prod)
        projectService.updateProject(newP.id, {
          name: newP.name,
          worldbuilding: newP.worldbuilding,
          writingStyle: newP.writingStyle,
          outline: newP.outline,
          wordCount: newP.wordCount
        });
        return newP;
      }
      return p;
    });
    setProjects(updated);
  };

  const createNewProject = async () => {
    try {
      const id = await projectService.createProject(`新作品 ${projects.length + 1}`);
      if (id) {
        const newProject: Project = {
          id,
          name: `新作品 ${projects.length + 1}`,
          worldbuilding: '',
          writingStyle: '第三人称视角，叙事为主，语言风格优美且富有张力，节奏快慢交替。',
          outline: '',
          wordCount: 2000,
          ownerId: user?.uid || '',
          lastModified: Date.now(),
          status: 'writing',
          characters: [],
          environments: [],
          chapters: []
        };
        setProjects(prev => [newProject, ...prev]);
        setActiveProjectId(id);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const deleteProject = async (id: string) => {
    if (confirm('确认永久删除该作品及其所有历史记录？')) {
      try {
        await projectService.deleteProject(id);
        const nextProjects = projects.filter(p => p.id !== id);
        setProjects(nextProjects);
        if (activeProjectId === id) {
          setActiveProjectId(nextProjects[0]?.id || null);
        }
      } catch (error) {
        console.error(error);
      }
    }
  };

  const handleGenerate = async () => {
    if (isGenerating || !activeProject) return;
    setIsGenerating(true);
    setCurrentOutput('');
    try {
      // Convert structured characters to text for Gemini
      const characterProfiles = activeProject.characters?.map(c => 
        `角色名：${c.name}\n外貌：${c.appearance}\n性格：${c.personality}\n背景：${c.background}\n习惯：${c.habits}`
      ).join('\n\n---\n\n') || '';

      const fullConfig: NovelConfig = {
        worldbuilding: activeProject.worldbuilding,
        writingStyle: activeProject.writingStyle,
        outline: activeProject.outline,
        wordCount: activeProject.wordCount,
        characterProfiles
      };

      let text = '';
      if (writeMode === 'single') {
        text = await generateChapter(fullConfig, chapterParams);
      } else if (writeMode === 'batch') {
        text = await generateBatch(fullConfig, batchParams);
      } else if (writeMode === 'regen') {
        text = await regenerateChapter(fullConfig, regenParams);
      }

      setCurrentOutput(text || '');
      if (text && activeProjectId) {
        const newChapter = {
          title: writeMode === 'single' ? (chapterParams.chapterTitle || `第 ${chapterParams.chapterNum} 章`) : 
                 writeMode === 'batch' ? `批量生成 (${batchParams.start}-${batchParams.end})` :
                 `重写 第 ${regenParams.chapterNum} 章`,
          content: text,
          timestamp: Date.now(),
          isFinal: false
        };
        const id = await projectService.saveChapter(activeProjectId, newChapter);
        setLastGeneratedChapterId(id);
        // Refresh local chapters State
        const updatedChapters = await projectService.getChapters(activeProjectId);
        setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, chapters: updatedChapters } : p));
      }
    } catch (error) {
      console.error(error);
      setCurrentOutput(`生成失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(currentOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadContent = () => {
    const blob = new Blob([currentOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chapterParams.chapterTitle || 'chapter'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const confirmChapter = async () => {
    if (!activeProjectId || !lastGeneratedChapterId) return;
    try {
      await projectService.updateChapter(activeProjectId, lastGeneratedChapterId, { isFinal: true });
      const updatedChapters = await projectService.getChapters(activeProjectId);
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, chapters: updatedChapters } : p));
      setLastGeneratedChapterId(null);
      alert('已正式收录进小说正文');
    } catch (error) {
      console.error(error);
    }
  };

  const finishProject = async () => {
    if (!activeProject) return;
    if (confirm('确认完结本作品？完结后将生成正式版小说并保存在卷轴中。')) {
      try {
        await projectService.updateProject(activeProject.id, { status: 'completed' });
        const updated = projects.map(p => p.id === activeProject.id ? { ...p, status: 'completed' } : p);
        setProjects(updated as Project[]);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const downloadFullNovel = () => {
    if (!activeProject || !activeProject.chapters) return;
    const finalChapters = activeProject.chapters
      .filter(c => c.isFinal)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (finalChapters.length === 0) {
      alert('尚无正式收录的章节，请先收录章节。');
      return;
    }

    const content = finalChapters.map(c => `# ${c.title}\n\n${c.content}`).join('\n\n---\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name}_全本.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const TabButton = ({ id, label, icon: Icon }: { id: Tab, label: string, icon: any }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setIsSidebarOpen(false);
      }}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group w-full text-left",
        activeTab === id 
          ? "bg-accent text-white shadow-lg shadow-accent/20" 
          : "hover:bg-accent/10 text-ink/60 hover:text-ink"
      )}
    >
      <Icon className={cn("size-5", activeTab === id ? "text-white" : "text-accent")} />
      <span className="font-medium text-sm">{label}</span>
      {activeTab === id && (
        <motion.div layoutId="active-pill" className="ml-auto">
          <ChevronRight className="size-4" />
        </motion.div>
      )}
    </button>
  );

  if (authLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-paper">
        <Loader2 className="size-10 animate-spin text-accent mb-4" />
        <p className="font-serif italic text-accent/60">正在载入文房四宝...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-paper relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#006994 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-10 rounded-3xl border border-accent/10 shadow-2xl z-10 flex flex-col items-center max-w-sm w-full text-center"
        >
          <div id="recaptcha-container"></div>
          <div className="size-16 bg-accent rounded-3xl flex items-center justify-center shadow-lg shadow-accent/30 mb-6">
            <ScrollText className="text-white size-8" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-serif mb-2">墨魂</h1>
          <p className="text-ink/60 mb-8 leading-relaxed font-sans text-sm">
            {authType === 'email' ? (authMode === 'login' ? '欢迎回来。请使用邮箱登录。' : '建立您的文墨空间。立刻注册。') : '使用手机验证码快速登录。'}
          </p>

          <div className="flex w-full mb-6 bg-paper p-1 rounded-2xl">
            <button 
              onClick={() => { setAuthType('email'); setIsCodeSent(false); setAuthError(''); }}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                authType === 'email' ? "bg-white text-accent shadow-sm" : "text-ink/40"
              )}
            >
              <Mail className="size-3" />
              邮箱登录
            </button>
            <button 
              onClick={() => { setAuthType('phone'); setAuthError(''); }}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2",
                authType === 'phone' ? "bg-white text-accent shadow-sm" : "text-ink/40"
              )}
            >
              <Smartphone className="size-3" />
              手机登录
            </button>
          </div>
          
          {authType === 'email' ? (
            <form onSubmit={handleAuth} className="w-full space-y-4">
              <div className="text-left">
                <label className="text-[10px] uppercase tracking-widest font-bold text-ink/30 ml-2">电子邮箱</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-ink/20" />
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full pl-12 pr-4 py-3 bg-paper rounded-xl border border-transparent focus:border-accent/20 focus:ring-0 outline-none text-sm"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="text-left">
                <label className="text-[10px] uppercase tracking-widest font-bold text-ink/30 ml-2">密码</label>
                <div className="relative mt-1">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-ink/20" />
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={authMode === 'login' ? "current-password" : "new-password"}
                    className="w-full pl-12 pr-4 py-3 bg-paper rounded-xl border border-transparent focus:border-accent/20 focus:ring-0 outline-none text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {authError && (
                <p className="text-red-500 text-xs mt-2">{authError}</p>
              )}

              <button 
                type="submit"
                className="w-full py-4 bg-accent text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-accent/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <LogIn className="size-5" />
                <span>{authMode === 'login' ? '登 录' : '注 册'}</span>
              </button>
              
              <button 
                type="button"
                onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
                className="mt-2 text-sm text-accent hover:underline w-full"
              >
                {authMode === 'login' ? '还没有账号？点此注册' : '已有账号？返回登录'}
              </button>
            </form>
          ) : (
            <div className="w-full">
              {!isCodeSent ? (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div className="text-left">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-ink/30 ml-2">手机号码</label>
                    <div className="relative mt-1">
                      <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-ink/20" />
                      <input 
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-paper rounded-xl border border-transparent focus:border-accent/20 focus:ring-0 outline-none text-sm"
                        placeholder="+86138..."
                      />
                    </div>
                    <p className="text-[10px] text-ink/30 mt-2 px-2">提示：请输入带有国家代号的手机号（如 +86）</p>
                  </div>
                  
                  {authError && (
                    <p className="text-red-500 text-xs mt-2">{authError}</p>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-4 bg-accent text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-accent/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <span>发送验证码</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button 
                      type="button" 
                      onClick={() => setIsCodeSent(false)}
                      className="p-2 hover:bg-paper rounded-full transition-colors"
                    >
                      <ArrowLeft className="size-4 text-accent" />
                    </button>
                    <p className="text-xs text-ink/60">验证码已发送至 {phoneNumber}</p>
                  </div>

                  <div className="text-left">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-ink/30 ml-2">验证码</label>
                    <div className="relative mt-1">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-ink/20" />
                      <input 
                        type="text"
                        required
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-paper rounded-xl border border-transparent focus:border-accent/20 focus:ring-0 outline-none text-sm tracking-[1em] text-center"
                        placeholder="000000"
                      />
                    </div>
                  </div>

                  {authError && (
                    <p className="text-red-500 text-xs mt-2">{authError}</p>
                  )}

                  <button 
                    type="submit"
                    className="w-full py-4 bg-accent text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-accent/25 hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <Check className="size-5" />
                    <span>确认验证</span>
                  </button>
                </form>
              )}
            </div>
          )}
          
          <p className="mt-8 text-[10px] text-ink/30 uppercase tracking-widest font-bold">Ink Soul Literary OS</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-paper text-ink font-sans relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-30 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Projects (Mobile Drawer & Desktop Fixed) */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-20 border-r border-accent/10 bg-accent/5 flex flex-col items-center py-6 gap-6 z-40 transition-transform duration-300 md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="size-12 bg-accent rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20 mb-4">
          <ScrollText className="text-white size-7" />
        </div>
        
        <div className="flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center gap-4 px-2">
          {isLoadingProjects ? (
            <Loader2 className="size-6 animate-spin text-accent/20" />
          ) : (
            projects.map(p => (
              <div key={p.id} className="relative group">
                <button
                  onClick={() => {
                    setActiveProjectId(p.id);
                  }}
                  className={cn(
                    "size-12 rounded-2xl flex items-center justify-center font-serif text-lg transition-all border-2",
                    activeProjectId === p.id 
                      ? "bg-white border-accent text-accent shadow-md" 
                      : "bg-white/50 border-transparent text-ink/40 hover:bg-white hover:text-ink"
                  )}
                  title={p.name}
                >
                  {p.name.slice(0, 1)}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                  className="absolute -top-1 -right-1 size-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity scale-0 group-hover:scale-100"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))
          )}
          <button 
            onClick={createNewProject}
            className="size-12 rounded-2xl border-2 border-dashed border-accent/30 flex items-center justify-center text-accent/50 hover:border-accent hover:text-accent transition-all hover:bg-accent/5"
          >
            <Plus className="size-6" />
          </button>
        </div>

        <div className="mt-auto mb-6">
          <button 
            onClick={handleLogout}
            className="size-12 rounded-2xl flex items-center justify-center text-ink/40 hover:bg-red-50 hover:text-red-500 transition-all"
            title="退出登录"
          >
            <LogOut className="size-6" />
          </button>
        </div>
      </aside>

      {/* Secondary Sidebar - Tabs (Mobile Drawer & Desktop Fixed) */}
      <aside className={cn(
        "fixed inset-y-0 left-20 w-56 border-r border-accent/10 bg-white/90 backdrop-blur-md flex flex-col p-4 z-40 transition-transform duration-300 md:relative md:translate-x-0 md:left-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-[calc(100%+80px)]"
      )}>
        <div className="mb-8 px-2 flex items-center justify-between">
          <div className="flex-1">
            <input 
              type="text"
              value={activeProject?.name || ''}
              onChange={(e) => updateActiveProject(p => ({ ...p, name: e.target.value }))}
              className="text-lg font-serif bg-transparent border-none outline-none focus:ring-0 w-full text-ink"
            />
            <div className="h-0.5 w-8 bg-accent mt-1"></div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 text-ink/40 hover:text-accent"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          <div className="px-3 mb-2 text-[10px] uppercase tracking-widest text-ink/30 font-bold">设定库</div>
          <TabButton id="character" label="角色档案" icon={UserCircle2} />
          <TabButton id="environment" label="环境描写" icon={MapPin} />
          <TabButton id="world" label="世界观" icon={Globe2} />
          <TabButton id="style" label="创作风格" icon={Palmtree} />
          <TabButton id="outline" label="故事大纲" icon={BookOpen} />

          <div className="px-3 mb-2 mt-6 text-[10px] uppercase tracking-widest text-ink/30 font-bold">实验室</div>
          <TabButton id="write" label="灵感创作" icon={PenLine} />
          <TabButton id="history" label="创作历史" icon={History} />

          {activeProject?.status !== 'completed' ? (
            <button
              onClick={finishProject}
              className="mt-8 flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group w-full text-left bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white"
            >
              <Flag className="size-5" />
              <span className="font-bold text-sm">标记完结</span>
            </button>
          ) : (
            <button
              onClick={downloadFullNovel}
              className="mt-8 flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group w-full text-left bg-accent text-white shadow-lg shadow-accent/20"
            >
              <Download className="size-5" />
              <span className="font-bold text-sm">生成全本小说</span>
            </button>
          )}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#fdfaf5] relative min-w-0">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#006994 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        
        {!activeProject ? (
          <div className="flex-1 flex flex-col items-center justify-center text-ink/20 text-center px-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden absolute top-4 left-4 p-2 text-ink/40 bg-white/50 rounded-xl shadow-sm border border-accent/5"
            >
              <Menu className="size-6" />
            </button>
            {isLoadingProjects ? (
              <>
                <Loader2 className="size-12 animate-spin mb-4" />
                <p className="font-serif italic text-accent/60">正在连接笔砚...</p>
              </>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="size-20 bg-accent/5 rounded-full flex items-center justify-center mb-6 mx-auto">
                  <ScrollText className="size-10 text-accent/20" />
                </div>
                <h2 className="text-2xl font-serif text-ink mb-2">欢迎来到墨魂</h2>
                <p className="text-ink/40 mb-8 max-w-xs">尚未检测到开启的卷轴，开启您的第一次创作吧。</p>
                <button 
                  onClick={createNewProject}
                  className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-2xl font-bold shadow-xl shadow-accent/20 hover:scale-105 transition-transform mx-auto"
                >
                  <Plus className="size-5" />
                  <span>新建创作项目</span>
                </button>
              </motion.div>
            )}
          </div>
        ) : (
          <>
            <header className="h-16 border-b border-accent/5 flex items-center justify-between px-4 md:px-8 bg-white/30 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="md:hidden p-2 text-ink/40 hover:text-accent bg-white/50 rounded-lg"
                >
                  <Menu className="size-5" />
                </button>
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="hidden sm:inline text-ink/30 text-sm font-medium whitespace-nowrap">当前模块:</span>
                  <span className="text-ink font-serif text-base md:text-lg truncate">
                    {activeTab === 'character' && '角色档案'}
                    {activeTab === 'environment' && '环境描写'}
                    {activeTab === 'world' && '世界观设定'}
                    {activeTab === 'style' && '创作风格'}
                    {activeTab === 'outline' && '故事情节'}
                    {activeTab === 'write' && '章节写作'}
                    {activeTab === 'history' && '历史存档'}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="bg-accent/5 px-3 py-1 rounded-full flex items-center gap-2">
                  <div className="size-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-bold text-accent uppercase tracking-tighter italic hidden xs:inline">Connected</span>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-4xl mx-auto"
                >
                   {activeTab === 'environment' && (
                    <div className="space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="prose prose-sm prose-neutral">
                          <h3>地理环境与舞台</h3>
                          <p className="text-ink/60">收录故事中的重要地点，为叙事提供沉浸式的空间感。</p>
                        </div>
                        <button 
                          onClick={async () => {
                            if (!activeProjectId) return;
                            const newEnv: Environment = {
                              id: '', // Service handles new if no ID, but UI needs full type or Omit
                              name: '新地点',
                              description: '',
                              atmosphere: '',
                              details: '',
                            };
                            const { id, ...envData } = newEnv;
                            await projectService.saveEnvironment(activeProjectId, envData);
                            loadProjectDetails(activeProjectId);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 hover:scale-105 transition-transform"
                        >
                          <Plus className="size-4" />
                          <span>添加地点</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        {activeProject.environments?.map((env) => (
                          <div key={env.id} className="bg-white rounded-3xl border border-accent/10 shadow-sm overflow-hidden">
                            <div className="bg-accent/5 px-6 py-4 border-b border-accent/5 flex items-center justify-between">
                              <input 
                                type="text"
                                value={env.name}
                                onChange={(e) => {
                                  if (!activeProjectId) return;
                                  const updated = { ...env, name: e.target.value };
                                  projectService.saveEnvironment(activeProjectId, updated);
                                  setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                    ...p,
                                    environments: p.environments?.map(ev => ev.id === env.id ? updated : ev)
                                  } : p));
                                }}
                                className="bg-transparent border-none outline-none font-serif text-xl text-accent focus:ring-0"
                              />
                              <button 
                                onClick={async () => {
                                  if (!activeProjectId) return;
                                  await projectService.deleteEnvironment(activeProjectId, env.id);
                                  loadProjectDetails(activeProjectId);
                                }}
                                className="text-red-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">删除地点</span>
                              </button>
                            </div>
                            <div className="p-6 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">环境概述</label>
                                  <textarea 
                                    value={env.description}
                                    onChange={(e) => {
                                      if (!activeProjectId) return;
                                      const updated = { ...env, description: e.target.value };
                                      projectService.saveEnvironment(activeProjectId, updated);
                                      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                        ...p,
                                        environments: p.environments?.map(ev => ev.id === env.id ? updated : ev)
                                      } : p));
                                    }}
                                    placeholder="地理位置、外观特征、标志性建筑..."
                                    className="w-full h-32 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">氛围渲染</label>
                                  <textarea 
                                    value={env.atmosphere}
                                    onChange={(e) => {
                                      if (!activeProjectId) return;
                                      const updated = { ...env, atmosphere: e.target.value };
                                      projectService.saveEnvironment(activeProjectId, updated);
                                      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                        ...p,
                                        environments: p.environments?.map(ev => ev.id === env.id ? updated : ev)
                                      } : p));
                                    }}
                                    placeholder="色彩基调、气味、声音要素、给人的感官直觉..."
                                    className="w-full h-32 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">内部细节与陈设</label>
                                <textarea 
                                  value={env.details}
                                  onChange={(e) => {
                                    if (!activeProjectId) return;
                                    const updated = { ...env, details: e.target.value };
                                    projectService.saveEnvironment(activeProjectId, updated);
                                    setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                      ...p,
                                      environments: p.environments?.map(ev => ev.id === env.id ? updated : ev)
                                    } : p));
                                  }}
                                  placeholder="具象的细节：如断裂的石柱、斑驳的壁画、角落里的枯枝..."
                                  className="w-full h-24 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {(!activeProject.environments || activeProject.environments.length === 0) && (
                          <div className="py-20 text-center border-2 border-dashed border-accent/10 rounded-3xl bg-white/50">
                            <MapPin className="size-16 mx-auto text-accent/10 mb-4" />
                            <p className="text-ink/40 font-serif italic">尚无地点记录，请点击上方按钮添加</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'character' && (
                    <div className="space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="prose prose-sm prose-neutral">
                          <h3>结构化角色建模</h3>
                          <p className="text-ink/60">通过多维度刻画，赋予纸面人物真正的灵魂。</p>
                        </div>
                        <button 
                          onClick={async () => {
                            if (!activeProjectId) return;
                            const newChar: Omit<Character, 'id'> = {
                              name: '新角色',
                              appearance: '',
                              personality: '',
                              background: '',
                              habits: '',
                            };
                            await projectService.saveCharacter(activeProjectId, newChar);
                            loadProjectDetails(activeProjectId);
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 hover:scale-105 transition-transform"
                        >
                          <Plus className="size-4" />
                          <span>添加角色</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-6">
                        {activeProject.characters?.map((char) => (
                          <div key={char.id} className="bg-white rounded-3xl border border-accent/10 shadow-sm overflow-hidden">
                            <div className="bg-accent/5 px-6 py-4 border-b border-accent/5 flex items-center justify-between">
                              <input 
                                type="text"
                                value={char.name}
                                onChange={(e) => {
                                  if (!activeProjectId) return;
                                  const updated = { ...char, name: e.target.value };
                                  projectService.saveCharacter(activeProjectId, updated);
                                  setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                    ...p,
                                    characters: p.characters?.map(c => c.id === char.id ? updated : c)
                                  } : p));
                                }}
                                className="bg-transparent border-none outline-none font-serif text-xl text-accent focus:ring-0"
                              />
                              <button 
                                onClick={async () => {
                                  if (!activeProjectId) return;
                                  await projectService.deleteCharacter(activeProjectId, char.id);
                                  loadProjectDetails(activeProjectId);
                                }}
                                className="text-red-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">删除角色</span>
                              </button>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">外貌描写</label>
                                  <textarea 
                                    value={char.appearance}
                                    onChange={(e) => {
                                      if (!activeProjectId) return;
                                      const updated = { ...char, appearance: e.target.value };
                                      projectService.saveCharacter(activeProjectId, updated);
                                      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                        ...p,
                                        characters: p.characters?.map(c => c.id === char.id ? updated : c)
                                      } : p));
                                    }}
                                    placeholder="衣着、五官特写、气质动态..."
                                    className="w-full h-24 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">背景身世</label>
                                  <textarea 
                                    value={char.background}
                                    onChange={(e) => {
                                      if (!activeProjectId) return;
                                      const updated = { ...char, background: e.target.value };
                                      projectService.saveCharacter(activeProjectId, updated);
                                      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                        ...p,
                                        characters: p.characters?.map(c => c.id === char.id ? updated : c)
                                      } : p));
                                    }}
                                    placeholder="过往经历、隐秘伤口、所处阶级..."
                                    className="w-full h-24 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                  />
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">核心性格</label>
                                  <textarea 
                                    value={char.personality}
                                    onChange={(e) => {
                                      if (!activeProjectId) return;
                                      const updated = { ...char, personality: e.target.value };
                                      projectService.saveCharacter(activeProjectId, updated);
                                      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                        ...p,
                                        characters: p.characters?.map(c => c.id === char.id ? updated : c)
                                      } : p));
                                    }}
                                    placeholder="性格缺陷、应对压力的方式、核心欲望..."
                                    className="w-full h-24 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">说话习惯与癖好</label>
                                  <textarea 
                                    value={char.habits}
                                    onChange={(e) => {
                                      if (!activeProjectId) return;
                                      const updated = { ...char, habits: e.target.value };
                                      projectService.saveCharacter(activeProjectId, updated);
                                      setProjects(prev => prev.map(p => p.id === activeProjectId ? {
                                        ...p,
                                        characters: p.characters?.map(c => c.id === char.id ? updated : c)
                                      } : p));
                                    }}
                                    placeholder="口头禅、动作癖好、社交距离感..."
                                    className="w-full h-24 bg-paper/30 rounded-xl p-3 text-sm border-none focus:ring-1 ring-accent/20 outline-none resize-none"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {(!activeProject.characters || activeProject.characters.length === 0) && (
                          <div className="py-20 text-center border-2 border-dashed border-accent/10 rounded-3xl bg-white/50">
                            <UserCircle2 className="size-16 mx-auto text-accent/10 mb-4" />
                            <p className="text-ink/40 font-serif italic">虚位以待，请点击上方按钮创建角色</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'world' && (
                    <div className="space-y-6">
                      <div className="prose prose-sm prose-neutral">
                        <h3>世界观架构</h3>
                        <p className="text-ink/60">构建你的时空规则。地理环境、社会权力机构、魔法体系或科技边界。</p>
                      </div>
                      <textarea
                        value={activeProject.worldbuilding}
                        onChange={(e) => updateActiveProject(p => ({ ...p, worldbuilding: e.target.value }))}
                        placeholder="时代背景：近未来的新中式赛博世界&#10;核心冲突：古武传承与机械义体化的对抗&#10;禁忌：严禁未经许可擅自连接‘真理网络’..."
                        className="w-full h-96 p-6 rounded-2xl bg-white border border-accent/10 focus:border-accent/30 focus:ring-4 focus:ring-accent/5 outline-none font-sans text-lg leading-relaxed shadow-sm resize-none"
                      />
                    </div>
                  )}

                  {activeTab === 'style' && (
                    <div className="space-y-6">
                      <div className="prose prose-sm prose-neutral">
                        <h3>创作笔调</h3>
                        <p className="text-ink/60">定义叙事的质感。是华丽复古的辞藻，还是冷峻简洁的短句？</p>
                      </div>
                      <textarea
                        value={activeProject.writingStyle}
                        onChange={(e) => updateActiveProject(p => ({ ...p, writingStyle: e.target.value }))}
                        className="w-full h-64 p-6 rounded-2xl bg-white border border-accent/10 focus:border-accent/30 focus:ring-4 focus:ring-accent/5 outline-none font-sans text-lg leading-relaxed shadow-sm resize-none"
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-white border border-accent/5">
                          <label className="block text-xs font-bold text-accent uppercase mb-2">单章目标字数</label>
                          <input 
                            type="number"
                            value={activeProject.wordCount}
                            onChange={(e) => updateActiveProject(p => ({ ...p, wordCount: parseInt(e.target.value) }))}
                            className="w-full bg-transparent border-none outline-none text-2xl font-serif"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'outline' && (
                    <div className="space-y-6">
                      <div className="prose prose-sm prose-neutral">
                        <h3>故事情节大纲</h3>
                        <p className="text-ink/60">录入起承转合的每一个锚点，确保AI在续写时时刻保持逻辑闭环。</p>
                      </div>
                      <textarea
                        value={activeProject.outline}
                        onChange={(e) => updateActiveProject(p => ({ ...p, outline: e.target.value }))}
                        placeholder="第一卷：龙战于野。讲述主角苏墨走出废墟，建立初步名望。&#10;核心事件：苏家灭门真相浮出水面..."
                        className="w-full h-96 p-6 rounded-2xl bg-white border border-accent/10 focus:border-accent/30 focus:ring-4 focus:ring-accent/5 outline-none font-sans text-lg leading-relaxed shadow-sm resize-none"
                      />
                    </div>
                  )}

                  {activeTab === 'write' && (
                <div className="space-y-8">
                  {/* Mode Switcher */}
                  <div className="flex p-1 bg-accent/5 rounded-2xl w-fit mx-auto border border-accent/10">
                    {[
                      { id: 'single', label: '单章写作', icon: PenLine },
                      { id: 'batch', label: '批量生成', icon: Layers },
                      { id: 'regen', label: '定向重写', icon: RefreshCcw }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setWriteMode(mode.id as any)}
                        className={cn(
                          "flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold transition-all",
                          writeMode === mode.id ? "bg-accent text-white shadow-md shadow-accent/20" : "text-accent/60 hover:text-accent"
                        )}
                      >
                        <mode.icon className="size-4" />
                        <span>{mode.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {writeMode === 'single' && (
                        <>
                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">当章节次与标题</label>
                            <div className="flex items-center gap-3">
                              <span className="text-xl font-serif whitespace-nowrap">第</span>
                              <input 
                                type="number" 
                                value={chapterParams.chapterNum}
                                onChange={(e) => setChapterParams({ ...chapterParams, chapterNum: parseInt(e.target.value) })}
                                className="w-16 bg-accent/5 rounded px-2 py-1 text-center font-serif text-lg outline-none focus:ring-2 ring-accent/20"
                              />
                              <span className="text-xl font-serif whitespace-nowrap">章</span>
                              <input 
                                type="text" 
                                placeholder="输入本章标题..."
                                value={chapterParams.chapterTitle}
                                onChange={(e) => setChapterParams({ ...chapterParams, chapterTitle: e.target.value })}
                                className="flex-1 bg-transparent border-b border-accent/10 font-serif text-lg py-1 outline-none focus:border-accent"
                              />
                            </div>
                          </div>

                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">本章梗概 (可选)</label>
                            <textarea 
                              placeholder="这一章主要发生了什么？例如：主角在林中偶遇神秘老者，并得到一份残片..."
                              value={chapterParams.synopsis}
                              onChange={(e) => setChapterParams({ ...chapterParams, synopsis: e.target.value })}
                              className="w-full h-32 bg-transparent resize-none outline-none text-sm leading-loose"
                            />
                          </div>
                        </>
                      )}

                      {writeMode === 'batch' && (
                        <div className="space-y-4">
                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">生成范围</label>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">从</span>
                                <input 
                                  type="number" 
                                  value={batchParams.start}
                                  onChange={(e) => {
                                    const start = parseInt(e.target.value);
                                    setBatchParams({ ...batchParams, start, total: batchParams.end - start + 1 });
                                  }}
                                  className="w-16 bg-accent/5 rounded px-2 py-1 text-center font-serif"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">到</span>
                                <input 
                                  type="number" 
                                  value={batchParams.end}
                                  onChange={(e) => {
                                    const end = parseInt(e.target.value);
                                    setBatchParams({ ...batchParams, end, total: end - batchParams.start + 1 });
                                  }}
                                  className="w-16 bg-accent/5 rounded px-2 py-1 text-center font-serif"
                                />
                              </div>
                              <span className="text-xs font-bold text-accent">共 {batchParams.total} 章</span>
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">各章梗概列表</label>
                            <textarea 
                              placeholder="例如：&#10;第1章：初入宗门&#10;第2章：深宵遇险&#10;第3章：反杀立威"
                              value={batchParams.batchSynopsisList}
                              onChange={(e) => setBatchParams({ ...batchParams, batchSynopsisList: e.target.value })}
                              className="w-full h-32 bg-transparent resize-none outline-none text-sm leading-loose"
                            />
                          </div>
                        </div>
                      )}

                      {writeMode === 'regen' && (
                        <div className="space-y-4">
                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">重写章节</label>
                            <div className="flex items-center gap-3">
                              <span className="text-xl font-serif">第</span>
                              <input 
                                type="number" 
                                value={regenParams.chapterNum}
                                onChange={(e) => setRegenParams({ ...regenParams, chapterNum: parseInt(e.target.value) })}
                                className="w-16 bg-accent/5 rounded px-2 py-1 text-center font-serif text-lg outline-none"
                              />
                              <span className="text-xl font-serif">章</span>
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">调整方案</label>
                            <textarea 
                              placeholder="例如：增加打斗描写的细节，主角表现得更果断一些..."
                              value={regenParams.regenNote}
                              onChange={(e) => setRegenParams({ ...regenParams, regenNote: e.target.value })}
                              className="w-full h-24 bg-transparent resize-none outline-none text-sm leading-loose"
                            />
                          </div>
                          <div className="p-4 rounded-2xl bg-white border border-accent/10 shadow-sm">
                            <label className="block text-[10px] font-bold text-accent uppercase tracking-widest mb-3">原版问题</label>
                            <textarea 
                              placeholder="原版中角色OOC了，节奏太慢..."
                              value={regenParams.issue}
                              onChange={(e) => setRegenParams({ ...regenParams, issue: e.target.value })}
                              className="w-full h-24 bg-transparent resize-none outline-none text-sm leading-loose"
                            />
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full py-4 bg-accent text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-accent/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="size-5 animate-spin" />
                            <span>文墨酿造中...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-5" />
                            <span>开始泼墨成篇</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-white rounded-3xl border border-accent/10 shadow-xl overflow-hidden flex flex-col min-h-[500px]">
                      <div className="bg-accent/5 px-6 py-4 border-b border-accent/5 flex items-center justify-between">
                        <span className="text-xs font-bold text-accent uppercase tracking-tighter">实时生成预览</span>
                        <div className="flex gap-2">
                          {lastGeneratedChapterId && (
                            <button 
                              onClick={confirmChapter}
                              className="flex items-center gap-2 px-3 py-1 bg-green-500 text-white rounded-lg text-[10px] font-bold shadow-md shadow-green-500/20 hover:scale-105 transition-all"
                            >
                              <CheckCircle2 className="size-3" />
                              收录进正文
                            </button>
                          )}
                          <button onClick={copyToClipboard} className="p-2 hover:bg-accent/10 rounded-lg transition-colors text-accent">
                            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                          </button>
                          <button onClick={downloadContent} className="p-2 hover:bg-accent/10 rounded-lg transition-colors text-accent">
                            <Download className="size-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                        {currentOutput ? (
                          <div className="markdown-body">
                            <ReactMarkdown>{currentOutput}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-ink/20 text-center space-y-4">
                            <PenLine className="size-16 stroke-[1]" />
                            <p className="font-serif italic text-lg tracking-wide">此处江山待染墨，起笔惊鸿引芳华</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6">
                  <div className="prose prose-sm prose-neutral">
                    <h3>创作长卷</h3>
                    <p className="text-ink/60">所有已生成的灵感都会自动沉淀于此，永久保存。</p>
                  </div>
                  
                  <div className="space-y-4">
                    {activeProject.chapters && activeProject.chapters.length > 0 ? (
                      activeProject.chapters.map((chapter) => (
                        <div key={chapter.id} className="group bg-white p-6 rounded-2xl border border-accent/5 hover:border-accent/20 transition-all shadow-sm">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <h4 className="text-lg font-serif">{chapter.title}</h4>
                              {chapter.isFinal ? (
                                <span className="bg-green-500/10 text-green-600 text-[10px] px-2 py-0.5 rounded-full font-bold">正式收录</span>
                              ) : (
                                <span className="bg-accent/10 text-accent/60 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">草稿</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              {!chapter.isFinal && (
                                <button 
                                  onClick={async () => {
                                    if (!activeProjectId) return;
                                    await projectService.updateChapter(activeProjectId, chapter.id, { isFinal: true });
                                    loadProjectDetails(activeProjectId);
                                  }}
                                  className="p-2 rounded-lg bg-green-50 text-green-500 hover:bg-green-100"
                                  title="确认收录"
                                >
                                  <CheckCircle2 className="size-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => {
                                  setCurrentOutput(chapter.content);
                                  setActiveTab('write');
                                }}
                                className="p-2 rounded-lg bg-accent/5 text-accent hover:bg-accent/10"
                                title="载入编辑器"
                              >
                                <RefreshCcw className="size-4" />
                              </button>
                              <button 
                                onClick={async () => {
                                  if (!activeProjectId) return;
                                  if (confirm('确认删除此章节？')) {
                                    await projectService.deleteChapter(activeProjectId, chapter.id);
                                    loadProjectDetails(activeProjectId);
                                  }
                                }}
                                className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                                title="删除章节"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-ink/30 font-medium mb-3">{new Date(chapter.timestamp).toLocaleString()}</p>
                          <p className="text-ink/50 text-sm line-clamp-3 leading-loose italic">
                            {chapter.content.replace(/[#*`]/g, '').slice(0, 200)}...
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center text-ink/20">
                        <History className="size-20 mx-auto stroke-[1] mb-4" />
                        <p className="font-serif italic">暂无历史卷宗</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
