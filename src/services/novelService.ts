import { 
  collection, 
  doc, 
  addDoc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  orderBy, 
  onSnapshot,
  CollectionReference,
  DocumentReference,
  QueryConstraint
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/errorHandlers';

export interface Character {
  id: string;
  name: string;
  appearance: string;
  personality: string;
  background: string;
  habits: string;
}

export interface Environment {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  details: string;
}

export interface SavedChapter {
  id: string;
  title: string;
  content: string;
  timestamp: number;
  isFinal?: boolean;
}

export interface Project {
  id: string;
  name: string;
  worldbuilding: string;
  writingStyle: string;
  outline: string;
  wordCount: number;
  ownerId: string;
  lastModified: number;
  status?: 'writing' | 'completed';
  // Subcollections are fetched separately
  characters?: Character[];
  environments?: Environment[];
  chapters?: SavedChapter[];
}

const PROJECTS_COL = 'projects';

export const projectService = {
  async getProjects(): Promise<Project[]> {
    if (!auth.currentUser) return [];
    const path = PROJECTS_COL;
    try {
      const q = query(
        collection(db, path), 
        where('ownerId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      return projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async createProject(name: string): Promise<string> {
    if (!auth.currentUser) throw new Error('Not authenticated');
    const path = PROJECTS_COL;
    try {
      const data = {
        name,
        worldbuilding: '',
        writingStyle: '第三人称视角，叙事为主，语言风格优美且富有张力，节奏快慢交替。',
        outline: '',
        wordCount: 2000,
        ownerId: auth.currentUser.uid,
        lastModified: Date.now(),
        status: 'writing'
      };
      const docRef = await addDoc(collection(db, path), data);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return '';
    }
  },

  async updateProject(id: string, data: Partial<Project>) {
    const path = `${PROJECTS_COL}/${id}`;
    try {
      await setDoc(doc(db, PROJECTS_COL, id), { ...data, lastModified: Date.now() }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteProject(id: string) {
    const path = `${PROJECTS_COL}/${id}`;
    try {
      await deleteDoc(doc(db, PROJECTS_COL, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // Characters
  async getCharacters(projectId: string): Promise<Character[]> {
    const path = `${PROJECTS_COL}/${projectId}/characters`;
    try {
      const snapshot = await getDocs(collection(db, path));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Character));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async saveCharacter(projectId: string, char: Omit<Character, 'id'> & { id?: string }) {
    const path = `${PROJECTS_COL}/${projectId}/characters`;
    try {
      if (char.id) {
        await setDoc(doc(db, path, char.id), char);
      } else {
        await addDoc(collection(db, path), char);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async deleteCharacter(projectId: string, charId: string) {
    const path = `${PROJECTS_COL}/${projectId}/characters/${charId}`;
    try {
      await deleteDoc(doc(db, PROJECTS_COL, projectId, 'characters', charId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // Environments
  async getEnvironments(projectId: string): Promise<Environment[]> {
    const path = `${PROJECTS_COL}/${projectId}/environments`;
    try {
      const snapshot = await getDocs(collection(db, path));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Environment));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async saveEnvironment(projectId: string, env: Omit<Environment, 'id'> & { id?: string }) {
    const path = `${PROJECTS_COL}/${projectId}/environments`;
    try {
      if (env.id) {
        await setDoc(doc(db, path, env.id), env);
      } else {
        await addDoc(collection(db, path), env);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async deleteEnvironment(projectId: string, envId: string) {
    const path = `${PROJECTS_COL}/${projectId}/environments/${envId}`;
    try {
      await deleteDoc(doc(db, PROJECTS_COL, projectId, 'environments', envId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  // Chapters
  async getChapters(projectId: string): Promise<SavedChapter[]> {
    const path = `${PROJECTS_COL}/${projectId}/chapters`;
    try {
      const snapshot = await getDocs(collection(db, path));
      const chapters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SavedChapter));
      return chapters.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  async saveChapter(projectId: string, chapter: Omit<SavedChapter, 'id'>) {
    const path = `${PROJECTS_COL}/${projectId}/chapters`;
    try {
      const docRef = await addDoc(collection(db, path), chapter);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return '';
    }
  },

  async updateChapter(projectId: string, chapterId: string, data: Partial<SavedChapter>) {
    const path = `${PROJECTS_COL}/${projectId}/chapters/${chapterId}`;
    try {
      await setDoc(doc(db, PROJECTS_COL, projectId, 'chapters', chapterId), data, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async deleteChapter(projectId: string, chapterId: string) {
    const path = `${PROJECTS_COL}/${projectId}/chapters/${chapterId}`;
    try {
      await deleteDoc(doc(db, PROJECTS_COL, projectId, 'chapters', chapterId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};
