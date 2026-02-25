// OurBookmark App
import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import BookshelfShelves from "./components/BookshelfShelves";
import Auth from './Auth';
import PublicReadingRoom from './pages/PublicReadingRoom';
import ReadingRoomSetup from './pages/ReadingRoomSetup';
import ReadingRoomFAQ from './pages/ReadingRoomFAQ';
// Utility functions
const getStorageData = (key, defaultValue = []) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch {
        return defaultValue;
    }
};

const setStorageData = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
};

const getWeekStart = (date = new Date()) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
};

// ── Book Search: ISBNdb (primary) → Google Books (fallback) ──
const GOOGLE_BOOKS_API_KEY = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || '';
const gbKey = GOOGLE_BOOKS_API_KEY ? `&key=${GOOGLE_BOOKS_API_KEY}` : '';

// Build best cover URL: direct image → Open Library via ISBN → null
const bestCover = (image, isbn13, isbn10) => {
  if (image && !image.includes('image_not_available')) return image;
  if (isbn13) return `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg`;
  if (isbn10) return `https://covers.openlibrary.org/b/isbn/${isbn10}-M.jpg`;
  return null;
};

// Shared helper: search ISBNdb via Vite proxy
// Detects author names vs book titles/ISBNs and uses the right endpoint
const searchISBNdb = async (query, maxResults = 8) => {
  const q = (query || '').trim();
  if (!q) return null;

  const looksLikeIsbn = /^[\d\-\s]{10,17}$/.test(q);
  const words = q.split(/\s+/);
  const looksLikeAuthor = !looksLikeIsbn && words.length >= 2 && words.length <= 3
    && words.every(w => /^[a-zA-Z'.()-]+$/.test(w));

  let books = null;

  // Try books endpoint first (works for titles, series, and general queries)
  try {
    const res = await fetch(`/api/isbndb?endpoint=${encodeURIComponent('/books/' + q)}&pageSize=${maxResults}&language=en`);
    if (res.ok) {
      const data = await res.json();
      if (data.books?.length) books = data.books;
    }
  } catch (err) {
    console.warn('ISBNdb books search failed:', err);
  }

  // If books returned nothing and query looks like an author name, try author endpoint
  if (!books && looksLikeAuthor) {
    try {
      const res = await fetch(`/api/isbndb?endpoint=${encodeURIComponent('/author/' + q)}&pageSize=${maxResults}&language=en`);
      if (res.ok) {
        const data = await res.json();
        if (data.books?.length) books = data.books;
      }
    } catch (err) {
      console.warn('ISBNdb author search failed:', err);
    }
  }

  if (!books?.length) return null;

  return books.map((b) => {
    const coverUrl = bestCover(b.image, b.isbn13, b.isbn);
    return {
      title: b.title || 'Unknown',
      author: (b.authors || [])[0] || '',
      cover: coverUrl,
      coverUrl: coverUrl,
      description: (b.synopsis || b.overview || '').slice(0, 120),
      isbn13: b.isbn13 || null,
      isbn10: b.isbn || null,
    };
  });
};

// Shared helper: search Google Books (fallback) with Open Library cover fallback
const searchGoogleBooksAPI = async (query, maxResults = 8) => {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${maxResults}&printType=books${gbKey}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.items?.length) return [];
  return data.items.map((item) => {
    const v = item.volumeInfo || {};
    const ids = v.industryIdentifiers || [];
    const isbn13 = ids.find((i) => i.type === 'ISBN_13')?.identifier || null;
    const isbn10 = ids.find((i) => i.type === 'ISBN_10')?.identifier || null;
    const coverUrl = bestCover(
      v.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
      isbn13,
      isbn10
    );
    return {
      title: v.title || 'Unknown',
      author: (v.authors || [])[0] || '',
      cover: coverUrl,
      coverUrl: coverUrl,
      description: (v.description || '').slice(0, 120),
      isbn13,
      isbn10,
    };
  });
};

// Combined search: ISBNdb first, Google Books fallback
const searchBooksUnified = async (query, maxResults = 8) => {
  try {
    const isbnResults = await searchISBNdb(query, maxResults);
    if (isbnResults?.length) return isbnResults;
  } catch (err) {
    console.warn('ISBNdb search failed, falling back to Google Books:', err);
  }
  try {
    return await searchGoogleBooksAPI(query, maxResults);
  } catch (err) {
    console.error('Google Books fallback also failed:', err);
    return [];
  }
};

// Fetch book cover: ISBNdb first, then Open Library fallback
const fetchBookCover = async (bookTitle) => {
  try {
    const cleanTitle = (bookTitle || "").split(" by ")[0].trim();
    if (!cleanTitle) return null;

    // 1) Try ISBNdb first (better coverage)
    try {
      const isbnRes = await fetch(
        `/api/isbndb?endpoint=${encodeURIComponent('/books/' + cleanTitle)}&pageSize=1&language=en`
      );
      if (isbnRes.ok) {
        const isbnData = await isbnRes.json();
        const b = isbnData.books?.[0];
        if (b) {
          const cover = bestCover(b.image, b.isbn13, b.isbn);
          if (cover) return cover;
        }
      }
    } catch (err) {
      console.warn('ISBNdb cover lookup failed, trying Open Library:', err);
    }

    // 2) Fallback: Open Library
    const searchQuery = encodeURIComponent(cleanTitle);
    const response = await fetch(
      `https://openlibrary.org/search.json?title=${searchQuery}&limit=10`
    );
    const data = await response.json();

    if (!data?.docs?.length) return null;

    const candidates = data.docs
      .filter((d) => d && (d.cover_i || d.isbn || d.edition_key || d.key))
      .sort((a, b) => {
        const aHasIsbn = a.isbn?.length ? 1 : 0;
        const bHasIsbn = b.isbn?.length ? 1 : 0;
        const aYear = a.first_publish_year || 0;
        const bYear = b.first_publish_year || 0;
        const aHasCover = a.cover_i ? 1 : 0;
        const bHasCover = b.cover_i ? 1 : 0;
        return (bHasIsbn - aHasIsbn) || (bYear - aYear) || (bHasCover - aHasCover);
      });

    const best = candidates[0] || data.docs[0];

    const isbn = best?.isbn?.[0];
    if (isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`;
    if (best?.cover_i) return `https://covers.openlibrary.org/b/id/${best.cover_i}-M.jpg`;
    const edition = best?.edition_key?.[0];
    if (edition) return `https://covers.openlibrary.org/b/olid/${edition}-M.jpg`;

    return null;
  } catch (error) {
    console.error("Error fetching book cover:", error);
    return null;
  }
};


// Main App Component
function MainApp({ user, onSignOut, onOpenAuth }) {
    // Smart default view: Log tab if setup complete, otherwise show onboarding
    const [currentView, setCurrentView] = useState('discover');
    const [children, setChildren] = useState([]);
    const [logs, setLogs] = useState([]);
    const [challenges, setChallenges] = useState([]); // Keep for read-a-thons
    const [syncs, setSyncs] = useState([]); // Goals (keeping internal name)
    const [classGroups, setClassGroups] = useState([]);
    const [familyProfile, setFamilyProfile] = useState(null);
    const [showAddChild, setShowAddChild] = useState(false);
    const [showAddLog, setShowAddLog] = useState(false);
    const [prefillBook, setPrefillBook] = useState(null);
const [selectedChild, setSelectedChild] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportChild, setReportChild] = useState(null);
    const [showCreateChallenge, setShowCreateChallenge] = useState(false);
    const [showCreateSync, setShowCreateSync] = useState(false);
    const [showJoinClass, setShowJoinClass] = useState(false);
    const [showCreateClass, setShowCreateClass] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showFAQ, setShowFAQ] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false); // Disabled - users explore first, sign up when they act
    const [showShareCard, setShowShareCard] = useState(false);
    const [shareCardChild, setShareCardChild] = useState(null);
    const [celebration, setCelebration] = useState(null); // { childName, bookTitle }
    const [error, setError] = useState(null);
    const completeOnboarding = (profile, newChildren) => {
        setFamilyProfile(profile);
        setStorageData('mybookmark_family', profile);
        if (newChildren && newChildren.length > 0) {
            setChildren(newChildren);
        }
        localStorage.setItem('mybookmark_onboarded', 'true');
        setShowOnboarding(false);
    };
    // Sign out function
    const handleSignOut = async () => {
        if (onSignOut) onSignOut();
    };
    useEffect(() => {
        try {
            setChildren(getStorageData('mybookmark_children', []));
            setLogs(getStorageData('mybookmark_logs', []));
            setChallenges(getStorageData('mybookmark_challenges', []));
            setSyncs(getStorageData('mybookmark_goals', []));
            setClassGroups(getStorageData('mybookmark_classgroups', []));
            setFamilyProfile(getStorageData('mybookmark_family', null));
} catch (err) {
            console.error('Error loading data:', err);
            setError('Failed to load data. Your browser storage might be full or corrupted.');
        }
    }, []);

    // Fix orphaned logs — reassign logs with unmatched childIds to first child
    const orphanFixRan = React.useRef(false);
    
    const fixOrphanedLogs = (currentChildren, currentLogs) => {
        if (currentChildren.length === 0 || currentLogs.length === 0) return currentLogs;
        const childIds = new Set(currentChildren.map(c => c.id));
        const hasOrphans = currentLogs.some(l => !childIds.has(l.childId));
        if (hasOrphans) {
            const firstChildId = currentChildren[0].id;
            return currentLogs.map(l => 
                childIds.has(l.childId) ? l : { ...l, childId: firstChildId }
            );
        }
        return currentLogs;
    };

    // Run orphan fix whenever children or logs change
    useEffect(() => {
        if (children.length === 0 || logs.length === 0) return;
        if (orphanFixRan.current) return;
        const childIds = new Set(children.map(c => c.id));
        const hasOrphans = logs.some(l => !childIds.has(l.childId));
        if (hasOrphans) {
            orphanFixRan.current = true;
            const firstChildId = children[0].id;
            const fixed = logs.map(l => 
                childIds.has(l.childId) ? l : { ...l, childId: firstChildId }
            );
            setLogs(fixed);
            setStorageData('mybookmark_logs', fixed);
        }
    }, [children, logs]);

    // Reset orphan fix flag when children IDs change (e.g., Supabase load)
    useEffect(() => {
        orphanFixRan.current = false;
    }, [children.map(c => c.id).join(',')]);

    // Load data from Supabase when user is signed in
    useEffect(() => {
        if (!user) return;
        
        const loadFromSupabase = async () => {
            try {
                // Load children
                const { data: dbChildren } = await supabase
                    .from('children')
                    .select('*')
                    .eq('user_id', user.id);
                
                if (dbChildren && dbChildren.length > 0) {
                    const mappedChildren = dbChildren.map(c => ({
                        id: c.id,
                        name: c.name,
                        grade: c.grade || '',
                        childType: c.child_type || c.childType || 'student',
                        goal: {
                            minutesPerDay: c.goal_minutes || 20,
                            daysPerWeek: c.goal_days || 5,
                            isCustom: !!c.goal_minutes
                        },
                        milestones: c.milestones || []
                    }));
                    setChildren(mappedChildren);
                    setStorageData('mybookmark_children', mappedChildren);
                }
            } catch (err) {
                console.warn('Error loading children from Supabase:', err);
            }

            try {
                // Load reading logs
                const { data: dbLogs } = await supabase
                    .from('reading_logs')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('date', { ascending: false });
                
                if (dbLogs && dbLogs.length > 0) {
                    const mappedLogs = dbLogs.map(l => ({
                        id: l.id,
                        childId: l.child_id,
                        bookTitle: l.book_title || l.bookTitle || '',
                        author: l.author || '',
                        coverUrl: l.cover_url || '',
                        date: l.date,
                        minutes: l.minutes,
                        notes: l.notes || '',
                        loved: l.loved || false,
                        readingType: l.reading_type || 'independent'
                    }));
                    setLogs(mappedLogs);
                    setStorageData('mybookmark_logs', mappedLogs);
                }
            } catch (err) {
                console.warn('Error loading logs from Supabase:', err);
            }

            try {
                // Load family profile
                const { data: dbProfile } = await supabase
                    .from('family_profiles')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();
                
                if (dbProfile?.data) {
                    setFamilyProfile(dbProfile.data);
                    setStorageData('mybookmark_family', dbProfile.data);
                }
            } catch (err) {
                console.warn('Error loading profile from Supabase:', err);
            }
        };

        loadFromSupabase();
    }, [user]);

    useEffect(() => {
        try {
            setStorageData('mybookmark_children', children);
        } catch (err) {
            console.error('Error saving children:', err);
            setError('Failed to save data. Your browser storage might be full.');
        }
    }, [children]);

    useEffect(() => {
        try {
            setStorageData('mybookmark_logs', logs);
        } catch (err) {
            console.error('Error saving logs:', err);
            setError('Failed to save data. Your browser storage might be full.');
        }
    }, [logs]);

    useEffect(() => {
        try {
            setStorageData('mybookmark_challenges', challenges);
        } catch (err) {
            console.error('Error saving challenges:', err);
        }
    }, [challenges]);

    useEffect(() => {
        try {
            setStorageData('mybookmark_goals', syncs);
        } catch (err) {
            console.error('Error saving goals:', err);
        }
    }, [syncs]);

    useEffect(() => {
        try {
            setStorageData('mybookmark_classgroups', classGroups);
        } catch (err) {
            console.error('Error saving class groups:', err);
        }
    }, [classGroups]);

    const addChild = async (name, grade, childType) => {
        // Validation
        if (!name || name.trim().length === 0) {
            setError('Child name is required');
            return false;
        }
        
        if (name.trim().length > 50) {
            setError('Child name is too long (max 50 characters)');
            return false;
        }
        const newChild = {
            id: Date.now().toString(),
            name: name.trim(),
            grade: grade ? grade.trim() : '',
            childType: childType || 'student',
            goal: {
                minutesPerDay: 0,
                daysPerWeek: 0,
                isCustom: true
            },
            milestones: []
        };

        // Write to Supabase if signed in
        if (user) {
            try {
                const { data, error: sbError } = await supabase
                    .from('children')
                    .insert({ user_id: user.id, name: newChild.name, grade: newChild.grade })
                    .select()
                    .single();
                if (data) {
                    newChild.id = data.id; // Use Supabase ID
                }
                if (sbError) console.warn('Supabase addChild error:', sbError);
            } catch (e) { console.warn('Supabase addChild error:', e); }
        }

        setChildren([...children, newChild]);
        setShowAddChild(false);
        setError(null);
        return true;
    };

    const updateChildGoal = (childId, minutesPerDay, daysPerWeek) => {
        setChildren(children.map(child => 
            child.id === childId 
                ? { ...child, goal: { minutesPerDay, daysPerWeek, isCustom: true } }
                : child
        ));
    };

    const updateChild = (childId, updates) => {
        setChildren(children.map(child => 
            child.id === childId 
                ? { ...child, ...updates }
                : child
        ));
    };

    const archiveChild = (id) => {
        if (confirm('Pause this reader? They can be restored anytime. Their reading history is always kept.')) {
            setChildren(children.map(c => c.id === id ? { ...c, archived: true } : c));
        }
    };

    const restoreChild = (id) => {
        setChildren(children.map(c => c.id === id ? { ...c, archived: false } : c));
    };

    const addLog = async (childId, bookTitle, minutes, date, subject, genre, coverUrl, timesRead, isFinished, chapterCurrent, chapterTotal) => {
        // Validation
        if (!childId) {
            setError('Please select a child');
            return false;
        }
        
        if (!bookTitle || bookTitle.trim().length === 0) {
            setError('Book title is required');
            return false;
        }
        
        if (!minutes || parseInt(minutes) <= 0) {
            setError('Please enter a valid number of minutes (greater than 0)');
            return false;
        }
        
        if (parseInt(minutes) > 1440) {
            setError('Minutes cannot exceed 24 hours (1440 minutes)');
            return false;
        }

        const newLog = {
            id: Date.now().toString(),
            childId,
            bookTitle: bookTitle.trim(),
            minutes: parseInt(minutes),
            hours: parseFloat((parseInt(minutes) / 60).toFixed(2)),
            date: date || new Date().toISOString().split('T')[0],
            subject: subject || null,
            genre: genre || null,
            coverUrl: coverUrl || null,
            timesRead: parseInt(timesRead) || 1,
            isFinished: isFinished || false,
            chapterCurrent: chapterCurrent && parseInt(chapterCurrent) > 0 ? parseInt(chapterCurrent) : null,
            chapterTotal: chapterTotal && parseInt(chapterTotal) > 0 ? parseInt(chapterTotal) : null
        };

        // Write to Supabase if signed in
        if (user) {
            try {
                // Upsert book
                let bookId = null;
                const bookTitleClean = bookTitle.trim().split(' by ')[0];
                const authorClean = bookTitle.trim().includes(' by ') ? bookTitle.trim().split(' by ').slice(1).join(' by ') : null;

                const { data: existingBook } = await supabase
                    .from('books')
                    .select('id')
                    .eq('title', bookTitleClean)
                    .limit(1);

                if (existingBook && existingBook.length > 0) {
                    bookId = existingBook[0].id;
                } else {
                    const { data: newBook } = await supabase
                        .from('books')
                        .insert({ title: bookTitleClean, author: authorClean, cover_url: coverUrl })
                        .select()
                        .single();
                    if (newBook) bookId = newBook.id;
                }

                const { data: sbLog, error: logError } = await supabase
                    .from('reading_logs')
                    .insert({
                        user_id: user.id,
                        child_id: childId,
                        book_id: bookId,
                        date: newLog.date,
                        minutes: newLog.minutes,
                    })
                    .select()
                    .single();

                if (sbLog) newLog.id = sbLog.id;
                if (logError) console.warn('Supabase addLog error:', logError);
            } catch (e) { console.warn('Supabase addLog error:', e); }
        }

        setLogs([newLog, ...logs]);
        setShowAddLog(false);
        setError(null);
        
        // Show celebration
        const child = children.find(c => c.id === childId);
        const celebrationData = {
            childName: child?.name || 'your child',
            bookTitle: bookTitle.trim().split(' by ')[0],
            timesRead: parseInt(timesRead) || 1,
            isFinished: isFinished || false,
            coverUrl: coverUrl || null
        };
        setCelebration(celebrationData);
        
        // Auto-dismiss after 4 seconds (only for non-finished; finished stays for rating)
        if (!isFinished) {
            setTimeout(() => setCelebration(null), 4000);
        }
        
        return true;
    };


    const deleteLog = (id) => {
        if (confirm('Remove this reading memory?')) {
            setLogs(logs.filter(l => l.id !== id));
        }
    };

    const createChallenge = (challengeData) => {
        const newChallenge = {
            id: Date.now().toString(),
            ...challengeData,
            participants: [],
            createdDate: new Date().toISOString()
        };
        setChallenges([...challenges, newChallenge]);
        setShowCreateChallenge(false);
    };

    const joinChallenge = (challengeId, childId) => {
        setChallenges(challenges.map(challenge => 
            challenge.id === challengeId
                ? {
                    ...challenge,
                    participants: [...(challenge.participants || []), {
                        childId,
                        joinedDate: new Date().toISOString(),
                        showOnLeaderboard: true
                    }]
                }
                : challenge
        ));
    };

    const leaveChallenge = (challengeId, childId) => {
        setChallenges(challenges.map(challenge => 
            challenge.id === challengeId
                ? {
                    ...challenge,
                    participants: challenge.participants.filter(p => p.childId !== childId)
                }
                : challenge
        ));
    };

    const createClassGroup = (classData) => {
        const joinCode = generateJoinCode();
        const newClass = {
            id: Date.now().toString(),
            ...classData,
            joinCode,
            students: [],
            createdDate: new Date().toISOString()
        };
        setClassGroups([...classGroups, newClass]);
        setShowCreateClass(false);
        return joinCode;
    };

    const joinClassGroup = (joinCode, childId, parentConsent) => {
        const classGroup = classGroups.find(c => c.joinCode.toUpperCase() === joinCode.toUpperCase());
        if (!classGroup) {
            alert('Invalid join code. Please check and try again.');
            return false;
        }

        // Check if already joined
        if (classGroup.students.some(s => s.childId === childId)) {
            alert('This child is already in this class group.');
            return false;
        }

        setClassGroups(classGroups.map(group => 
            group.id === classGroup.id
                ? {
                    ...group,
                    students: [...group.students, {
                        childId,
                        joinedDate: new Date().toISOString(),
                        parentConsent
                    }]
                }
                : group
        ));

        setShowJoinClass(false);
        return true;
    };

    const leaveClassGroup = (classId, childId) => {
        if (confirm('Remove this child from the class group?')) {
            setClassGroups(classGroups.map(group => 
                group.id === classId
                    ? {
                        ...group,
                        students: group.students.filter(s => s.childId !== childId)
                    }
                    : group
            ));
        }
    };

    const generateJoinCode = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    const createSync = (syncData) => {
        const newSync = {
            id: Date.now().toString(),
            ...syncData,
            createdDate: new Date().toISOString(),
            completed: false,
            completedDate: null
        };
        setSyncs([...syncs, newSync]);
        setShowCreateSync(false);
    };

    const completeSync = (syncId) => {
        setSyncs(syncs.map(sync => 
            sync.id === syncId 
                ? { ...sync, completed: true, completedDate: new Date().toISOString() }
                : sync
        ));
    };

    const deleteSync = (syncId) => {
        if (confirm('Remove this reading goal?')) {
            setSyncs(syncs.filter(s => s.id !== syncId));
        }
    };

    // Export/Import Functions
    const exportData = () => {
        try {
            const data = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                children,
                logs,
                challenges,
                goals: syncs,
                classGroups
            };
            
            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `ourbookmark-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            alert('Data exported successfully! Save this file in a safe place.');
        } catch (err) {
            console.error('Export error:', err);
            setError('Failed to export data. Please try again.');
        }
    };

    const importData = (fileContent) => {
        try {
            const data = JSON.parse(fileContent);
            
            // Validate data structure
            if (!data.version || !data.children || !Array.isArray(data.children)) {
                throw new Error('Invalid backup file format');
            }
            
            // Confirm with user
            const confirmMsg = `This will replace your current data with:\n` +
                `- ${data.children?.length || 0} children\n` +
                `- ${data.logs?.length || 0} reading logs\n` +
                `- ${data.goals?.length || 0} goals\n` +
                `\nAre you sure you want to continue?`;
            
            if (!confirm(confirmMsg)) {
                return false;
            }
            
            // Import data
            setChildren(data.children || []);
            setLogs(data.logs || []);
            setChallenges(data.challenges || []);
            setSyncs(data.goals || []);
            setClassGroups(data.classGroups || []);
            
            setShowSettings(false);
            alert('Data imported successfully!');
            setError(null);
            return true;
        } catch (err) {
            console.error('Import error:', err);
            setError('Failed to import data. Please make sure you selected a valid OurBookmark backup file.');
            return false;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}>
            <div className="max-w-2xl mx-auto bg-white min-h-screen shadow-xl">
                {/* Header */}
                {(() => {
                    // Calculate weekly stats for compact header
                    const weekStart = getWeekStart();
                    const weekLogs = logs.filter(l => new Date(l.date) >= weekStart);
                    const daysReadThisWeek = new Set(weekLogs.map(l => l.date)).size;
                    const hasChildren = children.length > 0;
                    const totalBooks = new Set(logs.map(l => l.bookTitle)).size;
                    const rereadBooks = Object.values(
                        logs.reduce((acc, l) => {
                            acc[l.bookTitle] = (acc[l.bookTitle] || 0) + 1;
                            return acc;
                        }, {})
                    ).filter(count => count > 1).length;
                    
                    return (
                        <div className={`text-center ${hasChildren ? 'p-4' : 'p-6'}`} style={{ background: '#FAF7F2' }}>
                            <style>{'@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap");'}</style>
                            <div className="flex justify-end mb-2 gap-2">
                                {!user && (
                                    <button
                                        onClick={() => onOpenAuth('signin')}
                                        className="px-3 py-1.5 rounded-lg transition-all text-sm flex items-center gap-1"
                                        style={{ color: '#4A4035' }}
                                    >
                                        👤 <span className="text-xs">Sign In / Sign Up</span>
                                    </button>
                                )}
                            </div>
                            
                            {hasChildren ? (
                                /* Compact header for returning users */
                                <div>
                                    <h1 className="text-xl font-semibold mb-1" style={{ fontFamily: "'Playfair Display', serif", color: '#1C1712' }}>
                                        📚 The {familyProfile?.familyName || 'My'} Family Library
                                    </h1>
                                    <p className="text-sm" style={{ color: '#8C7F72' }}>
                                        {daysReadThisWeek === 0 
                                            ? "Your family's reading space" 
                                            : `📖 You've read together ${daysReadThisWeek} time${daysReadThisWeek !== 1 ? 's' : ''} this week`}
                                        {rereadBooks > 0 && ` · 🔁 ${rereadBooks} favorite${rereadBooks !== 1 ? 's' : ''} reread`}
                                    </p>
                                </div>
                            ) : (
                                /* Full header for new users */
                                <div>
                                    <h1 className="text-2xl font-semibold mb-2" style={{ fontFamily: "'Playfair Display', serif", color: '#1C1712' }}>
                                        📚 {familyProfile?.familyName ? `The ${familyProfile.familyName} Family Library` : 'OurBookmark'}
                                    </h1>
                                    <p className="text-sm mb-2" style={{ color: '#4A4035' }}>Every story your family shares. Tracked, remembered, and passed along.</p>
                                    <p className="text-xs" style={{ color: '#8C7F72' }}>Log reading in seconds. Curate shelves of your favorite picks. Built for families who love books.</p>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Error Banner */}
                {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 m-4 rounded">
                        <div className="flex items-start">
                            <div className="flex-1">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                            <button
                                onClick={() => setError(null)}
                                className="text-red-500 hover:text-red-700 ml-4"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* Celebration Banner */}
                {celebration && !celebration.isFinished && (
                    <div 
                        className="bg-gradient-to-r from-amber-100 to-orange-100 border-l-4 border-amber-500 p-4 m-4 rounded cursor-pointer"
                        onClick={() => setCelebration(null)}
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-2xl">💜</span>
                            <div className="flex-1">
                                <p className="font-medium text-amber-900">
                                    Another memory saved 📖 You read {celebration.bookTitle} with {celebration.childName}{celebration.timesRead > 1 ? ` (${celebration.timesRead} times!)` : ''} today.
                                </p>
                                <p className="text-sm text-amber-800 mt-1">
                                    Saved to your library — these are the ones you'll remember.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {celebration && celebration.isFinished && (
                    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-5">
                        {/* Confetti particles */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            {[...Array(40)].map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute w-2 h-2 rounded-full"
                                    style={{
                                        left: `${Math.random() * 100}%`,
                                        top: `-5%`,
                                        backgroundColor: ['#f59e0b', '#ef4444', '#8b5cf6', '#10b981', '#3b82f6', '#ec4899'][i % 6],
                                        animation: `confettiFall ${2 + Math.random() * 3}s ease-in forwards`,
                                        animationDelay: `${Math.random() * 1.5}s`,
                                    }}
                                />
                            ))}
                        </div>
                        <style>{`
                            @keyframes confettiFall {
                                0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                                100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                            }
                        `}</style>
                        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center relative z-10 shadow-2xl">
                            <div className="text-5xl mb-3">🎉</div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-1">Book complete!</h2>
                            <p className="text-gray-500 mb-5">
                                {celebration.childName} finished <span className="font-semibold text-gray-700">{celebration.bookTitle}</span>
                                {celebration.timesRead > 1 ? ` (${celebration.timesRead} times!)` : ''}
                            </p>
                            {celebration.coverUrl && (
                                <img src={celebration.coverUrl} alt="" className="w-20 h-28 object-cover rounded-lg shadow mx-auto mb-5" />
                            )}
                            <p className="text-sm font-medium text-gray-600 mb-3">How did they like it?</p>
                            <div className="flex justify-center gap-4 mb-6">
                                {[
                                    { emoji: '🥰', label: 'Loved it' },
                                    { emoji: '😊', label: 'Liked it' },
                                    { emoji: '😐', label: 'It was ok' },
                                ].map(({ emoji, label }) => (
                                    <button
                                        key={label}
                                        onClick={() => {
                                            // Save rating to the most recent log
                                            const updatedLogs = [...logs];
                                            if (updatedLogs.length > 0) {
                                                updatedLogs[0] = { ...updatedLogs[0], rating: label };
                                                setLogs(updatedLogs);
                                            }
                                            setCelebration(null);
                                        }}
                                        className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-amber-50 transition-colors"
                                    >
                                        <span className="text-3xl">{emoji}</span>
                                        <span className="text-xs text-gray-500">{label}</span>
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => setCelebration(null)}
                                className="text-sm text-gray-400 hover:text-gray-600"
                            >
                                Skip
                            </button>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="p-5" style={{ paddingBottom: 80 }}>
                    {currentView === 'discover' && (
                        <DiscoverView 
                            children={children}
                            onLogBook={(book) => {
                                setPrefillBook(book);
                                setShowAddLog(true);
                            }}
                            familyProfile={familyProfile}
                        />
                    )}
                    {currentView === 'library' && (
                        <LibraryView 
                            children={children}
                            logs={logs}
                            goals={syncs}
                            challenges={challenges}
                            onAddLog={() => setShowAddLog(true)}
                            onDeleteLog={deleteLog}
                            onCreateGoal={() => setShowCreateSync(true)}
                            onCompleteGoal={completeSync}
                            onDeleteGoal={deleteSync}
                            onOpenSettings={() => setCurrentView('settings')}
                            selectedChild={selectedChild}
                            onSelectChild={setSelectedChild}
                            familyProfile={familyProfile}
onLogBook={(book) => {
                                setPrefillBook(book);
                                setShowAddLog(true);
                            }}
/>
                    )}
                    {currentView === 'progress' && (
                        <ProgressView 
                            children={children}
                            logs={logs}
                            onOpenSettings={() => setCurrentView('settings')}
                            familyProfile={familyProfile}
                            selectedChild={selectedChild}
                            onSelectChild={setSelectedChild}
                            updateChildGoal={updateChildGoal}
                            onGenerateReport={(child) => {
                                setReportChild(child);
                                setShowReportModal(true);
                            }}
                            onShareCard={(child) => {
                                setShareCardChild(child);
                                setShowShareCard(true);
                            }}
                        />
                    )}
                    {currentView === 'bookshelf' && (
                        <BookshelfView 
                            children={children}
                            logs={logs}
                            onOpenSettings={() => setCurrentView('settings')}
                            familyProfile={familyProfile}
                        />
                    )}
                    {currentView === 'readingroom' && (
                        <ReadingRoomTab user={user} onSignIn={() => onOpenAuth('signin')} />
                    )}
                    {currentView === 'settings' && (
                        <SettingsTab
                            familyProfile={familyProfile}
                            setFamilyProfile={(profile) => {
                                setFamilyProfile(profile);
                                setStorageData('mybookmark_family', profile);
                            }}
                            children={children}
                            logs={logs}
                            onAddChild={() => setShowAddChild(true)}
                            onDeleteChild={archiveChild}
                            onUpdateChild={updateChild}
                            onExport={exportData}
                            onImport={importData}
                            user={user}
                            onSignOut={handleSignOut}
                            onSignIn={() => onOpenAuth('signin')}
                            onShareCard={(child) => {
                                setShareCardChild(child);
                                setShowShareCard(true);
                            }}
                            onGenerateReport={(child) => {
                                setReportChild(child);
                                setShowReportModal(true);
                            }}
                            onShowAbout={() => setShowAbout(true)}
                            onShowFAQ={() => setShowFAQ(true)}
                        />
                    )}
                </div>

                {/* Bottom Navigation */}
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '100%',
                    maxWidth: '672px',
                    background: '#FAF7F2',
                    borderTop: '1px solid rgba(0,0,0,0.08)',
                    display: 'flex',
                    zIndex: 40,
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}>
                    {[
                        { id: 'discover', icon: '✨', label: 'Discover' },
                        { id: 'library', icon: '📚', label: 'Library' },
                        { id: 'progress', icon: '📊', label: 'Progress' },
                        { id: 'readingroom', icon: '📖', label: 'Room' },
                        { id: 'settings', icon: '🏠', label: 'Home' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setCurrentView(tab.id)}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 2,
                                padding: '10px 0 8px',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: currentView === tab.id ? '#C4873A' : '#8C7F72',
                                fontFamily: "'DM Sans', sans-serif",
                                transition: 'color 0.15s',
                            }}
                        >
                            <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{tab.icon}</span>
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: currentView === tab.id ? 600 : 400,
                                letterSpacing: '0.01em',
                            }}>{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Modals */}
                {showAddChild && (
                    <AddChildModal 
                        onClose={() => { setShowAddChild(false); setCurrentView('settings'); }}
                        onAdd={addChild}
                    />
                )}

                {showAddLog && (
                    <AddLogModal 
                        children={children}
                        logs={logs}
                        onClose={() => { setShowAddLog(false); setPrefillBook(null); }}
                        onAdd={addLog}
                        prefillBook={prefillBook}
                    />
                )}

                {showReportModal && reportChild && (
                    <ReportModal
                        child={reportChild}
                        logs={logs.filter(l => l.childId === reportChild.id)}
                        onClose={() => setShowReportModal(false)}
                    />
                )}

                {showCreateChallenge && (
                    <CreateChallengeModal
                        onClose={() => setShowCreateChallenge(false)}
                        onCreate={createChallenge}
                    />
                )}

                {showCreateSync && (
                    <CreateGoalModal
                        children={children}
                        onClose={() => setShowCreateSync(false)}
                        onCreate={createSync}
                    />
                )}

                {showJoinClass && (
                    <JoinClassModal
                        children={children}
                        onClose={() => setShowJoinClass(false)}
                        onJoin={joinClassGroup}
                    />
                )}

                {showCreateClass && (
                    <CreateClassModal
                        onClose={() => setShowCreateClass(false)}
                        onCreate={createClassGroup}
                    />
                )}

                {showShareCard && shareCardChild && (
                    <ShareCardModal
                        child={shareCardChild}
                        logs={logs}
                        children={children}
                        familyProfile={familyProfile}
                        onClose={() => {
                            setShowShareCard(false);
                            setShareCardChild(null);
                        }}
                    />
                )}

                {/* Onboarding Modal - shows for first-time users */}
                {showOnboarding && (
                    <OnboardingModal 
                        onComplete={completeOnboarding}
                        onSkip={() => {
                            localStorage.setItem('mybookmark_onboarded', 'true');
                            setShowOnboarding(false);
                        }}
                    />
                )}


                {/* About Modal */}
                {showAbout && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={() => setShowAbout(false)}>
                        <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center p-6 pb-4 border-b sticky top-0 bg-white">
                                <h2 className="text-xl font-semibold text-gray-800">About OurBookmark</h2>
                                <button onClick={() => setShowAbout(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                            </div>
                            <div className="p-6 pt-4 overflow-y-auto">
                            {/* How It Works */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-amber-800 mb-4">📚 How It Works (3 Steps)</h3>
                                
                                <div className="space-y-4">
                                    <div className="bg-amber-50 p-4 rounded-lg">
                                        <h4 className="font-semibold text-amber-900 mb-1">1. Keep Stories in Seconds</h4>
                                        <p className="text-sm text-gray-600">Log read-aloud or independent reading in seconds. Track minutes, books, and chapter completion—all in one place.</p>
                                    </div>
                                    
                                    <div className="bg-amber-50 p-4 rounded-lg">
                                        <h4 className="font-semibold text-amber-900 mb-1">2. Watch Reading Grow</h4>
                                        <p className="text-sm text-gray-600">See gentle progress dashboards for each child. Build a reading habit without pressure or comparison.</p>
                                    </div>
                                    
                                    <div className="bg-amber-50 p-4 rounded-lg">
                                        <h4 className="font-semibold text-amber-900 mb-1">3. Share When Needed</h4>
                                        <p className="text-sm text-gray-600">Export clean, school-ready reports for teachers, homeschool records, or reading programs—no re-logging required.</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Who It's For */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-amber-800 mb-3">👨‍👩‍👧‍👦 Who It's For</h3>
                                <p className="text-gray-600 mb-3">Built for families first. OurBookmark works whether your child is:</p>
                                <ul className="text-sm text-gray-600 space-y-2 ml-4">
                                    <li>• A baby listening to their first books</li>
                                    <li>• A preschooler enjoying read-alouds</li>
                                    <li>• A K–8 student reading independently</li>
                                    <li>• Homeschooled, in school, or somewhere in between</li>
                                </ul>
                                <p className="text-sm text-gray-500 mt-3 italic">Teachers and schools can use OurBookmark too—but families never need school adoption to get value.</p>
                            </div>
                            
                            {/* Key Features */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-amber-800 mb-3">✨ Key Features</h3>
                                <ul className="text-sm text-gray-600 space-y-2 ml-4">
                                    <li>• Unlimited children per family</li>
                                    <li>• Read-aloud + independent reading</li>
                                    <li>• Minutes + book completion</li>
                                    <li>• Chapter book support</li>
                                    <li>• Visual progress dashboards</li>
                                    <li>• Optional class & read-a-thon participation</li>
                                    <li>• School-ready PDF & CSV exports (Beanstack-compatible)</li>
                                    <li>• Privacy-first by design</li>
                                </ul>
                            </div>
                            
                            <button
                                onClick={() => setShowAbout(false)}
                                className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-all"
                            >
                                Close
                            </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* FAQ Modal */}
                {showFAQ && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={() => setShowFAQ(false)}>
                        <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center p-6 pb-4 border-b sticky top-0 bg-white">
                                <h2 className="text-xl font-semibold text-gray-800">Frequently Asked Questions</h2>
                                <button onClick={() => setShowFAQ(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                            </div>
                            <div className="p-6 pt-4 overflow-y-auto">
                            <div className="space-y-6">
                                {/* General */}
                                <div>
                                    <h3 className="text-lg font-semibold text-amber-800 mb-3">General</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">What is OurBookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">OurBookmark is a parent-focused reading tracker that helps families log reading, track progress across multiple children, and generate school-ready reports. It works from the very first read-aloud through independent reading and beyond.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Who is OurBookmark for?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Parents of babies, toddlers, and school-age kids. Families with multiple children. Homeschool families and co-ops. Parents participating in school reading programs. Teachers and schools can use it too, but families never need school adoption to get value.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Do I need a school or teacher to use OurBookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">No. OurBookmark is fully usable on its own by families. Teachers, classrooms, or schools can optionally participate for challenges or reporting, but it's never required.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Reading & Tracking */}
                                <div>
                                    <h3 className="text-lg font-semibold text-amber-800 mb-3">Reading & Tracking</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">What kinds of reading can I track?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Read-alouds (perfect for babies and toddlers), shared reading, independent reading, chapter books, and rereading favorite books. Every kind of reading counts.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Do you track minutes or books?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Both. Parents can save reading minutes, book titles, and book completion (especially helpful for chapter books). This gives you a complete picture of reading habits.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can I track multiple children?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. OurBookmark supports unlimited children per household, always. There are no per-child fees.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can kids save stories themselves?</h4>
                                            <p className="text-sm text-gray-600 mt-1">OurBookmark is parent-controlled by design. Older children can participate with supervision, but parents always manage the account, data, and sharing.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Reports & School Programs */}
                                <div>
                                    <h3 className="text-lg font-semibold text-amber-800 mb-3">Reports & School Programs</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can I generate reports for school or homeschool records?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. OurBookmark generates clean, school-ready PDF and CSV reports for teachers, homeschool documentation, reading challenges, and read-a-thons.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Teachers & Groups */}
                                <div>
                                    <h3 className="text-lg font-semibold text-amber-800 mb-3">Teachers, Classrooms & Groups</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can teachers use OurBookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. Teachers can create optional class groups, track participation, and run reading challenges. Families can join classes if they choose, but don't need a teacher to use OurBookmark.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can PTAs, co-ops, or schools use OurBookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. OurBookmark can be used for classroom challenges, school-wide read-a-thons, homeschool co-ops, and community reading programs.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Privacy & Data */}
                                <div>
                                    <h3 className="text-lg font-semibold text-amber-800 mb-3">Privacy & Data</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Is OurBookmark privacy-friendly?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. Privacy is core to how OurBookmark is built. No ads, no selling personal data, parents control what is shared, and children never create independent accounts.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Do you collect personal data about children?</h4>
                                            <p className="text-sm text-gray-600 mt-1">OurBookmark collects only what's necessary to provide the service, such as reading activity entered by parents. We do not sell data or use it for advertising. Parents remain in control at all times.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Getting Started */}
                                <div>
                                    <h3 className="text-lg font-semibold text-amber-800 mb-3">Getting Started</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">How long does it take to set up?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Most families are up and running in under 2 minutes.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">What devices does OurBookmark work on?</h4>
                                            <p className="text-sm text-gray-600 mt-1">OurBookmark is a web app that works on phones, tablets, and computers. No download required.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <button
                                onClick={() => setShowFAQ(false)}
                                className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-all mt-6"
                            >
                                Close
                            </button>
                            </div>
                        </div>
                  </div>
                )}

            </div>
        </div>
    );
}

// Log View Component
function LogView({ children, logs, onAddLog, onDeleteLog, onOpenSettings, familyProfile }) {
    const babyEmoji = familyProfile?.babyEmoji || '👶';

    if (children.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="text-6xl mb-4">{babyEmoji}</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a reader first</h3>
                <p className="text-sm text-gray-400">
                    Set up your readers in
                    <button onClick={onOpenSettings} className="text-amber-700 hover:text-amber-900 underline font-medium">
                        Home
                    </button>
                    to start saving stories
                </p>
            </div>
        );
    }

    const recentLogs = logs.slice(0, 20);

    return (
        <div>
            <button 
                className="w-full bg-amber-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-amber-700 transition-all"
                onClick={onAddLog}
            >
                📖 Log a Reading Session
            </button>

            {recentLogs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">📖</div>
                    <h3 className="text-lg text-gray-600 mb-2">No reading logged yet</h3>
                    <p className="text-sm">Click above to log your first session!</p>
                </div>
            ) : (
                <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3">Recent Sessions</h3>
                    {recentLogs.map(log => {
                        const child = children.find(c => c.id === log.childId);
                        return (
                            <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-3 border-l-4 border-l-amber-600 hover:shadow-md transition-shadow">
                                <div className="flex gap-3">
                                    {/* Book Cover */}
                                    {log.coverUrl ? (
                                        <img 
                                            src={log.coverUrl} 
                                            alt="Book cover" 
                                            className="w-14 h-20 object-contain bg-white rounded shadow-sm flex-shrink-0"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-14 h-20 bg-gradient-to-br from-amber-100 to-amber-200 rounded flex items-center justify-center flex-shrink-0">
                                            <span className="text-2xl">📖</span>
                                        </div>
                                    )}
                                    
                                    {/* Log Details */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <div className="font-semibold text-gray-800">{child?.name || children[0]?.name || 'Unknown'}</div>
                                                <div className="text-xs text-gray-500">{formatDate(log.date)}</div>
                                            </div>
                                            <button 
                                                className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                                                onClick={() => onDeleteLog(log.id)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                        <div className="text-sm text-gray-600 mb-2 truncate">{log.bookTitle}</div>
                                        <span className="inline-block px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-full">
                                            {log.minutes} minutes
                                        </span>
                                        {log.timesRead > 1 && (
                                            <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full ml-1">
                                                🔁 {log.timesRead}x
                                            </span>
                                        )}
                                        {log.isFinished && (
                                            <span className="inline-block px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full ml-1">
                                                ✓ Done
                                            </span>
                                        )}
                                        {log.rating && (
                                            <span className="inline-block px-2 py-1 text-xs ml-1">
                                                {log.rating === 'Loved it' ? '🥰' : log.rating === 'Liked it' ? '😊' : '😐'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Library View Component - Tabs: To Be Read / Books (grouped by book)
function LibraryView({ children, logs, goals, challenges, onAddLog, onDeleteLog, onCreateGoal, onCompleteGoal, onDeleteGoal, onOpenSettings, selectedChild, onSelectChild, familyProfile, onLogBook }) {
    const [activeTab, setActiveTab] = useState('books');
    const [toReadList, setToReadList] = useState(() => getStorageData('mybookmark_toread', []));
    const [expandedBook, setExpandedBook] = useState(null);
    const [showAddToRead, setShowAddToRead] = useState(false);
    const [addToReadQuery, setAddToReadQuery] = useState('');
    const [addToReadResults, setAddToReadResults] = useState([]);
    const [addToReadSearching, setAddToReadSearching] = useState(false);
    const babyEmoji = familyProfile?.babyEmoji || '👶';

    // Persist to-read list
    useEffect(() => {
        setStorageData('mybookmark_toread', toReadList);
    }, [toReadList]);

    // Search for to-read additions
    const searchForToRead = async (query) => {
        if (!query.trim() || query.length < 2) { setAddToReadResults([]); return; }
        setAddToReadSearching(true);
        try {
            const results = await searchBooksUnified(query, 6);
            setAddToReadResults(results || []);
        } catch (err) { setAddToReadResults([]); }
        setAddToReadSearching(false);
    };

    useEffect(() => {
        const timer = setTimeout(() => { if (addToReadQuery) searchForToRead(addToReadQuery); }, 400);
        return () => clearTimeout(timer);
    }, [addToReadQuery]);

    const addToReadListFn = (book) => {
        const newItem = {
            id: Date.now().toString(),
            title: book.title || book.bookTitle || '',
            author: book.author || '',
            coverUrl: book.coverUrl || book.cover || null,
            addedDate: new Date().toISOString(),
        };
        setToReadList(prev => [newItem, ...prev]);
        setShowAddToRead(false);
        setAddToReadQuery('');
        setAddToReadResults([]);
    };

    const removeFromToRead = (id) => {
        setToReadList(prev => prev.filter(item => item.id !== id));
    };

    if (children.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="text-6xl mb-4">{babyEmoji}</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a reader first</h3>
                <p className="text-sm text-gray-400">
                    Set up your readers in{' '}
                    <button onClick={onOpenSettings} className="text-amber-700 hover:text-amber-900 underline font-medium">
                        Home
                    </button>
                    {' '}to start saving stories
                </p>
            </div>
        );
    }

    const activeGoals = goals.filter(g => !g.completed);

    // Group logs by book title for Books tab
    const bookGroups = {};
    logs.forEach(log => {
        const key = log.bookTitle;
        if (!bookGroups[key]) {
            bookGroups[key] = {
                bookTitle: log.bookTitle,
                author: log.author || '',
                coverUrl: log.coverUrl || null,
                sessions: [],
                totalMinutes: 0,
                totalTimesRead: 0,
                lastRead: log.date,
                hasFinished: false,
                rating: null,
                chapterProgress: null,
                chapterCurrent: null,
                chapterTotal: null,
            };
        }
        bookGroups[key].sessions.push(log);
        bookGroups[key].totalMinutes += log.minutes || 0;
        bookGroups[key].totalTimesRead += log.timesRead || 1;
        if (log.isFinished) bookGroups[key].hasFinished = true;
        if (log.rating && !bookGroups[key].rating) bookGroups[key].rating = log.rating;
        if (log.chapterCurrent != null && log.chapterCurrent > 0 && log.chapterTotal) {
            bookGroups[key].chapterCurrent = Math.max(bookGroups[key].chapterCurrent || 0, parseInt(log.chapterCurrent));
            bookGroups[key].chapterTotal = parseInt(log.chapterTotal);
            bookGroups[key].chapterProgress = (bookGroups[key].chapterCurrent / bookGroups[key].chapterTotal) * 100;
        }
        if (log.coverUrl && !bookGroups[key].coverUrl) {
            bookGroups[key].coverUrl = log.coverUrl;
        }
    });

    const groupedBooks = Object.values(bookGroups).sort((a, b) => 
        new Date(b.sessions[0]?.date) - new Date(a.sessions[0]?.date)
    );
    const isFavorite = (b) => b.sessions.length > 1 || b.totalTimesRead > 1;

    // Format minutes nicely
    const fmtMin = (m) => {
        if (m >= 60) return `${Math.floor(m/60)}hr ${m%60 > 0 ? m%60 + 'min' : ''}`.trim();
        return `${m} min`;
    };

    return (
        <div>
            {/* Log a Reading Session Button */}
            <button 
                className="w-full bg-amber-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-amber-700 transition-all mb-4"
                onClick={onAddLog}
            >
                📖 Log a Reading Session
            </button>

            {/* Active Goals Summary */}
            {activeGoals.length > 0 && (
                <div className="mb-5">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-gray-700">🎯 Active Goals</h3>
                        <button onClick={onCreateGoal} className="text-xs text-amber-700 font-medium">+ New Goal</button>
                    </div>
                    <div className="space-y-2">
                        {activeGoals.slice(0, 3).map(goal => {
                            const child = children.find(c => c.id === goal.childId);
                            return (
                                <div key={goal.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-gray-800 truncate">{goal.name}</div>
                                        <div className="text-xs text-gray-500">{child?.name}</div>
                                    </div>
                                    <div className="flex gap-2 ml-2">
                                        <button onClick={() => onCompleteGoal(goal.id)} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">✓ Done</button>
                                        <button onClick={() => onDeleteGoal(goal.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ===== TABS ===== */}
            <div className="flex border-b-2 border-gray-200 mb-4">
                <button
                    className={`flex-1 py-3 text-sm font-semibold text-center relative transition-colors ${
                        activeTab === 'toread' ? 'text-amber-700' : 'text-gray-400'
                    }`}
                    onClick={() => setActiveTab('toread')}
                >
                    📖 To Be Read
                    {toReadList.length > 0 && (
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                            activeTab === 'toread' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}>{toReadList.length}</span>
                    )}
                    {activeTab === 'toread' && <div className="absolute bottom-[-2px] left-[10%] right-[10%] h-[3px] bg-amber-600 rounded-t" />}
                </button>
                <button
                    className={`flex-1 py-3 text-sm font-semibold text-center relative transition-colors ${
                        activeTab === 'books' ? 'text-amber-700' : 'text-gray-400'
                    }`}
                    onClick={() => setActiveTab('books')}
                >
                    📚 Books
                    {groupedBooks.length > 0 && (
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                            activeTab === 'books' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}>{groupedBooks.length}</span>
                    )}
                    {activeTab === 'books' && <div className="absolute bottom-[-2px] left-[10%] right-[10%] h-[3px] bg-amber-600 rounded-t" />}
                </button>
            </div>

            {/* ===== TO READ TAB ===== */}
            {activeTab === 'toread' && (
                <div>
                    {toReadList.length === 0 && !showAddToRead ? (
                        <div className="text-center py-12">
                            <p className="text-sm text-gray-500 mb-3">No books on your list yet.</p>
                            <button
                                onClick={() => setShowAddToRead(true)}
                                className="text-sm text-amber-700 font-semibold hover:text-amber-800"
                            >
                                + Add a book
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {toReadList.map(item => (
                                <div key={item.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
                                    {item.coverUrl ? (
                                        <img src={item.coverUrl} alt="" className="w-12 h-16 object-contain bg-white rounded-lg shadow-sm flex-shrink-0" onError={(e) => e.target.style.display='none'} />
                                    ) : (
                                        <div className="w-12 h-16 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <span className="text-lg">📖</span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm text-gray-800 truncate">{item.title}</div>
                                        {item.author && <div className="text-xs text-gray-500">by {item.author}</div>}
                                        <div className="text-xs text-gray-400 mt-1">
                                            Added {new Date(item.addedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => removeFromToRead(item.id)}
                                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 border border-gray-200 rounded-lg"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}

                            {/* Add to read button */}
                            <button
                                onClick={() => setShowAddToRead(true)}
                                className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-semibold text-gray-400 hover:border-amber-500 hover:text-amber-600 transition-all"
                            >
                                + Add a book
                            </button>
                        </div>
                    )}

                    {/* Add to read modal */}
                    {showAddToRead && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={() => { setShowAddToRead(false); setAddToReadQuery(''); setAddToReadResults([]); }}>
                            <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
                                <h3 className="text-lg font-semibold mb-3">Add to your reading list</h3>
                                <input
                                    type="text"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent mb-3"
                                    placeholder="Search by title or author..."
                                    value={addToReadQuery}
                                    onChange={(e) => setAddToReadQuery(e.target.value)}
                                    autoFocus
                                />
                                {addToReadSearching && (
                                    <p className="text-sm text-gray-400 text-center py-3">Searching...</p>
                                )}
                                {addToReadResults.length > 0 && (
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {addToReadResults.map((book, idx) => (
                                            <button
                                                key={idx}
                                                className="w-full flex items-center gap-3 p-3 bg-gray-50 hover:bg-amber-50 rounded-lg text-left transition-colors"
                                                onClick={() => addToReadListFn(book)}
                                            >
                                                {book.coverUrl ? (
                                                    <img src={book.coverUrl} alt="" className="w-10 h-14 object-contain bg-white rounded shadow-sm flex-shrink-0" onError={(e) => e.target.style.display='none'} />
                                                ) : (
                                                    <div className="w-10 h-14 bg-amber-100 rounded flex items-center justify-center flex-shrink-0 text-sm">📖</div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-gray-800 truncate">{book.title}</div>
                                                    {book.author && <div className="text-xs text-gray-500">by {book.author}</div>}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {addToReadQuery.length >= 2 && !addToReadSearching && addToReadResults.length === 0 && (
                                    <p className="text-sm text-gray-400 text-center py-3">No books found. Try a different search.</p>
                                )}
                                <button
                                    onClick={() => { setShowAddToRead(false); setAddToReadQuery(''); setAddToReadResults([]); }}
                                    className="w-full mt-3 py-3 bg-gray-100 text-gray-600 rounded-lg font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== BOOKS TAB (grouped by book) ===== */}
            {activeTab === 'books' && (
                <div>
                    {groupedBooks.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <div className="text-5xl mb-3">📚</div>
                            <p className="text-sm">No reading sessions yet</p>
                            <p className="text-xs mt-1">Tap "Log a Reading Session" to keep your first memory!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* In Progress / Completed */}

                            {/* In Progress */}
                            {(() => {
                                const inProgress = groupedBooks.filter(b => !b.hasFinished && b.chapterTotal > 0);
                                const completed = groupedBooks.filter(b => b.hasFinished || !b.chapterTotal);
                                
                                const renderBookCard = (group, prefix = '') => {
                                    const key = prefix + group.bookTitle;
                                    const isCompleted = group.hasFinished || !group.chapterTotal;
                                    return (
                                        <div key={key} className={`bg-white border rounded-xl mb-2 overflow-hidden ${isCompleted ? 'border-green-200' : 'border-gray-200'}`}>
                                            <button
                                                className="w-full flex items-center gap-3 p-3 text-left"
                                                onClick={() => setExpandedBook(expandedBook === key ? null : key)}
                                            >
                                                {group.coverUrl ? (
                                                    <img src={group.coverUrl} alt="" className="w-12 h-16 object-contain bg-white rounded-lg shadow-sm flex-shrink-0" onError={(e) => e.target.style.display='none'} />
                                                ) : (
                                                    <div className={`w-12 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-green-50' : 'bg-amber-50'}`}><span className="text-lg">📖</span></div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-gray-800 truncate">{group.bookTitle}</div>
                                                    {group.author && <div className="text-xs text-gray-500">{group.author}</div>}
                                                    {group.chapterProgress && !isCompleted && (
                                                        <div className="mt-1">
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, group.chapterProgress)}%` }} />
                                                                </div>
                                                                <span className="text-xs text-gray-400">Ch {group.chapterCurrent}/{group.chapterTotal}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">📖 {group.sessions.length} session{group.sessions.length !== 1 ? 's' : ''}</span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">⏱ {fmtMin(group.totalMinutes)}</span>
                                                        {group.totalTimesRead > group.sessions.length && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">🔁 {group.totalTimesRead}x total</span>
                                                        )}
                                                        {isFavorite(group) && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-400 font-medium">💜 Favorite</span>
                                                        )}
                                                        {isCompleted && group.rating && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-600">{group.rating === 'Loved it' ? '🥰' : group.rating === 'Liked it' ? '😊' : '😐'} {group.rating}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <span className={`text-xs text-gray-300 transition-transform ${expandedBook === key ? 'rotate-180' : ''}`}>▼</span>
                                            </button>
                                            {expandedBook === key && (
                                                <div className="border-t border-gray-100">
                                                    {group.sessions.map(log => {
                                                        const child = children.find(c => c.id === log.childId);
                                                        return (
                                                            <div key={log.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 text-sm">
                                                                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                                                                <span className="font-medium text-gray-700">{child?.name}</span>
                                                                <span className="text-gray-400">·</span>
                                                                <span className="text-gray-500">{new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                                                {log.timesRead > 1 && <span className="text-xs text-purple-600 font-medium">🔁 {log.timesRead}x</span>}
                                                                {log.isFinished && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">✓</span>}
                                                                {log.rating && <span className="text-xs">{log.rating === 'Loved it' ? '🥰' : log.rating === 'Liked it' ? '😊' : '😐'}</span>}
                                                                {log.chapterCurrent != null && log.chapterTotal != null && log.chapterCurrent > 0 && (
                                                                    <span className="text-xs text-gray-400">Ch {log.chapterCurrent}/{log.chapterTotal}</span>
                                                                )}
                                                                <span className="ml-auto px-2 py-0.5 bg-amber-600 text-white text-xs rounded-full font-medium">{log.minutes}m</span>
                                                                <button onClick={() => onDeleteLog(log.id)} className="text-xs text-red-400 hover:text-red-600 ml-1">Delete</button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {inProgress.length > 0 && (
                                            <div className="mb-3">
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📖 In Progress ({inProgress.length})</h3>
                                                {inProgress.map(group => renderBookCard(group, 'ip-'))}
                                            </div>
                                        )}
                                        {completed.length > 0 && (
                                            <div className="mb-3">
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">✅ Completed ({completed.length})</h3>
                                                {completed.map(group => renderBookCard(group, 'done-'))}
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Discover View Component
function DiscoverView({ children, onLogBook, familyProfile }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [expandedSection, setExpandedSection] = useState(null);

    // Get current month for seasonal picks
    const month = new Date().getMonth(); // 0-11

    const getSeasonalTheme = () => {
        if (month === 0) return { title: '❄️ Winter Reads', key: 'winter' };
        if (month === 1) return { title: '🖤 Black History Month', key: 'bhm' };
        if (month === 2) return { title: '🌸 Women\'s History Month', key: 'whm' };
        if (month === 3) return { title: '🌍 Earth Day Reads', key: 'earth' };
        if (month === 4 || month === 5) return { title: '☀️ Summer Reading Prep', key: 'summer' };
        if (month === 6 || month === 7) return { title: '🏖️ Summer Reading', key: 'summer' };
        if (month === 8) return { title: '📚 Back to School', key: 'backtoschool' };
        if (month === 9) return { title: '🎃 Fall Favorites', key: 'fall' };
        if (month === 10) return { title: '🦃 Gratitude & Giving', key: 'gratitude' };
        return { title: '🎄 Holiday Reading', key: 'holiday' };
    };

    const seasonal = getSeasonalTheme();

    // Curated book lists
    const CURATED_BOOKS = {
        board: [
            { title: 'Goodnight Moon', author: 'Margaret Wise Brown', cover: 'https://covers.openlibrary.org/b/isbn/9780694003617-L.jpg' },
            { title: 'Brown Bear, Brown Bear, What Do You See?', author: 'Bill Martin Jr.', cover: 'https://covers.openlibrary.org/b/isbn/9780805047905-L.jpg' },
            { title: 'The Very Hungry Caterpillar', author: 'Eric Carle', cover: 'https://covers.openlibrary.org/b/isbn/9780399226908-L.jpg' },
            { title: 'Dear Zoo', author: 'Rod Campbell', cover: 'https://covers.openlibrary.org/b/isbn/9781416947370-L.jpg' },
            { title: 'Pat the Bunny', author: 'Dorothy Kunhardt', cover: 'https://covers.openlibrary.org/b/isbn/9780307120007-L.jpg' },
            { title: 'Moo, Baa, La La La!', author: 'Sandra Boynton', cover: 'https://covers.openlibrary.org/b/isbn/9780671449018-L.jpg' },
        ],
        picture: [
            { title: 'Where the Wild Things Are', author: 'Maurice Sendak', cover: 'https://covers.openlibrary.org/b/isbn/9780060254926-L.jpg' },
            { title: 'The Snowy Day', author: 'Ezra Jack Keats', cover: 'https://covers.openlibrary.org/b/isbn/9780670654000-L.jpg' },
            { title: 'Corduroy', author: 'Don Freeman', cover: 'https://covers.openlibrary.org/b/isbn/9780140501735-L.jpg' },
            { title: 'Dragons Love Tacos', author: 'Adam Rubin', cover: 'https://covers.openlibrary.org/b/isbn/9780803736801-L.jpg' },
            { title: 'The Day the Crayons Quit', author: 'Drew Daywalt', cover: 'https://covers.openlibrary.org/b/isbn/9780399255373-L.jpg' },
            { title: 'Last Stop on Market Street', author: 'Matt de la Peña', cover: 'https://covers.openlibrary.org/b/isbn/9780399257742-L.jpg' },
        ],
        chapter: [
            { title: 'Diary of a Wimpy Kid', author: 'Jeff Kinney', cover: 'https://covers.openlibrary.org/b/isbn/9780810993136-L.jpg' },
            { title: 'Dog Man', author: 'Dav Pilkey', cover: 'https://covers.openlibrary.org/b/isbn/9780545581608-L.jpg' },
            { title: 'Magic Tree House: Dinosaurs Before Dark', author: 'Mary Pope Osborne', cover: 'https://covers.openlibrary.org/b/isbn/9780679824114-L.jpg' },
            { title: 'Junie B. Jones and the Stupid Smelly Bus', author: 'Barbara Park', cover: 'https://covers.openlibrary.org/b/isbn/9780679826125-L.jpg' },
            { title: 'Ivy + Bean', author: 'Annie Barrows', cover: 'https://covers.openlibrary.org/b/isbn/9780811849098-L.jpg' },
            { title: 'The Bad Guys', author: 'Aaron Blabey', cover: 'https://covers.openlibrary.org/b/isbn/9780545912402-L.jpg' },
        ],
        middlegrade: [
            { title: 'Percy Jackson: The Lightning Thief', author: 'Rick Riordan', cover: 'https://covers.openlibrary.org/b/isbn/9780786838653-L.jpg' },
            { title: 'Wonder', author: 'R.J. Palacio', cover: 'https://covers.openlibrary.org/b/isbn/9780375869020-L.jpg' },
            { title: 'Holes', author: 'Louis Sachar', cover: 'https://covers.openlibrary.org/b/isbn/9780374332662-L.jpg' },
            { title: 'The One and Only Ivan', author: 'Katherine Applegate', cover: 'https://covers.openlibrary.org/b/isbn/9780061992254-L.jpg' },
            { title: 'New Kid', author: 'Jerry Craft', cover: 'https://covers.openlibrary.org/b/isbn/9780062691194-L.jpg' },
            { title: 'Hatchet', author: 'Gary Paulsen', cover: 'https://covers.openlibrary.org/b/isbn/9781416936473-L.jpg' },
        ],
        seasonal: {
            bhm: [
                { title: 'Hidden Figures', author: 'Margot Lee Shetterly', cover: 'https://covers.openlibrary.org/b/isbn/9780062742469-L.jpg' },
                { title: 'The Story of Ruby Bridges', author: 'Robert Coles', cover: 'https://covers.openlibrary.org/b/isbn/9780439472265-L.jpg' },
                { title: 'I Am Enough', author: 'Grace Byers', cover: 'https://covers.openlibrary.org/b/isbn/9780062667120-L.jpg' },
                { title: 'Crown: An Ode to the Fresh Cut', author: 'Derrick Barnes', cover: 'https://covers.openlibrary.org/b/isbn/9781572842243-L.jpg' },
                { title: 'Each Kindness', author: 'Jacqueline Woodson', cover: 'https://covers.openlibrary.org/b/isbn/9780399246524-L.jpg' },
                { title: 'Hair Love', author: 'Matthew A. Cherry', cover: 'https://covers.openlibrary.org/b/isbn/9780525553366-L.jpg' },
            ],
            whm: [
                { title: 'She Persisted', author: 'Chelsea Clinton', cover: 'https://covers.openlibrary.org/b/isbn/9781524741723-L.jpg' },
                { title: 'Rosie Revere, Engineer', author: 'Andrea Beaty', cover: 'https://covers.openlibrary.org/b/isbn/9781419708459-L.jpg' },
                { title: 'Good Night Stories for Rebel Girls', author: 'Elena Favilli', cover: 'https://covers.openlibrary.org/b/isbn/9780997895810-L.jpg' },
                { title: 'Ada Twist, Scientist', author: 'Andrea Beaty', cover: 'https://covers.openlibrary.org/b/isbn/9781419721373-L.jpg' },
            ],
            summer: [
                { title: 'The Vanderbeekers of 141st Street', author: 'Karina Yan Glaser', cover: 'https://covers.openlibrary.org/b/isbn/9781328499219-L.jpg' },
                { title: 'From the Mixed-Up Files', author: 'E.L. Konigsburg', cover: 'https://covers.openlibrary.org/b/isbn/9780689711817-L.jpg' },
                { title: 'The Lemonade War', author: 'Jacqueline Davies', cover: 'https://covers.openlibrary.org/b/isbn/9780547237657-L.jpg' },
                { title: 'Frog and Toad Are Friends', author: 'Arnold Lobel', cover: 'https://covers.openlibrary.org/b/isbn/9780064440202-L.jpg' },
            ],
            winter: [
                { title: 'The Snowy Day', author: 'Ezra Jack Keats', cover: 'https://covers.openlibrary.org/b/isbn/9780670654000-L.jpg' },
                { title: 'Snow', author: 'Uri Shulevitz', cover: 'https://covers.openlibrary.org/b/isbn/9780374468620-L.jpg' },
                { title: 'The Mitten', author: 'Jan Brett', cover: 'https://covers.openlibrary.org/b/isbn/9780399219207-L.jpg' },
                { title: 'Owl Moon', author: 'Jane Yolen', cover: 'https://covers.openlibrary.org/b/isbn/9780399214578-L.jpg' },
            ],
            backtoschool: [
                { title: 'The Kissing Hand', author: 'Audrey Penn', cover: 'https://covers.openlibrary.org/b/isbn/9780878685851-L.jpg' },
                { title: 'First Day Jitters', author: 'Julie Danneberg', cover: 'https://covers.openlibrary.org/b/isbn/9781580890540-L.jpg' },
                { title: 'The Name Jar', author: 'Yangsook Choi', cover: 'https://covers.openlibrary.org/b/isbn/9780440417996-L.jpg' },
                { title: 'Enemy Pie', author: 'Derek Munson', cover: 'https://covers.openlibrary.org/b/isbn/9780811827782-L.jpg' },
            ],
            fall: [
                { title: 'Leaf Man', author: 'Lois Ehlert', cover: 'https://covers.openlibrary.org/b/isbn/9780152053048-L.jpg' },
                { title: 'Fletcher and the Falling Leaves', author: 'Julia Rawlinson', cover: 'https://covers.openlibrary.org/b/isbn/9780061573972-L.jpg' },
                { title: 'Room on the Broom', author: 'Julia Donaldson', cover: 'https://covers.openlibrary.org/b/isbn/9780142501122-L.jpg' },
            ],
            gratitude: [
                { title: 'Bear Says Thank You', author: 'Karma Wilson', cover: 'https://covers.openlibrary.org/b/isbn/9781416928171-L.jpg' },
                { title: 'Those Shoes', author: 'Maribeth Boelts', cover: 'https://covers.openlibrary.org/b/isbn/9780763642846-L.jpg' },
                { title: 'The Giving Tree', author: 'Shel Silverstein', cover: 'https://covers.openlibrary.org/b/isbn/9780060256654-L.jpg' },
            ],
            holiday: [
                { title: 'The Polar Express', author: 'Chris Van Allsburg', cover: 'https://covers.openlibrary.org/b/isbn/9780395389492-L.jpg' },
                { title: 'How the Grinch Stole Christmas', author: 'Dr. Seuss', cover: 'https://covers.openlibrary.org/b/isbn/9780394800790-L.jpg' },
                { title: 'The Night Before Christmas', author: 'Clement C. Moore', cover: 'https://covers.openlibrary.org/b/isbn/9780385376716-L.jpg' },
            ],
            earth: [
                { title: 'The Lorax', author: 'Dr. Seuss', cover: 'https://covers.openlibrary.org/b/isbn/9780394823379-L.jpg' },
                { title: 'The Watcher', author: 'Jeanette Winter', cover: 'https://covers.openlibrary.org/b/isbn/9780375867743-L.jpg' },
                { title: 'We Are Water Protectors', author: 'Carole Lindstrom', cover: 'https://covers.openlibrary.org/b/isbn/9781250203557-L.jpg' },
            ],
        },
        bestsellers: [
            { title: 'Cat Kid Comic Club', author: 'Dav Pilkey', cover: 'https://covers.openlibrary.org/b/isbn/9781338712766-L.jpg' },
            { title: 'The Wild Robot', author: 'Peter Brown', cover: 'https://covers.openlibrary.org/b/isbn/9780316381994-L.jpg' },
            { title: 'Wings of Fire: The Dragonet Prophecy', author: 'Tui T. Sutherland', cover: 'https://covers.openlibrary.org/b/isbn/9780545349185-L.jpg' },
            { title: 'The Notebook of Doom', author: 'Troy Cummings', cover: 'https://covers.openlibrary.org/b/isbn/9780545493239-L.jpg' },
            { title: 'Big Nate', author: 'Lincoln Peirce', cover: 'https://covers.openlibrary.org/b/isbn/9780061944345-L.jpg' },
            { title: 'Amulet: The Stonekeeper', author: 'Kazu Kibuishi', cover: 'https://covers.openlibrary.org/b/isbn/9780439846813-L.jpg' },
            { title: 'The One and Only Bob', author: 'Katherine Applegate', cover: 'https://covers.openlibrary.org/b/isbn/9780062991317-L.jpg' },
            { title: 'Front Desk', author: 'Kelly Yang', cover: 'https://covers.openlibrary.org/b/isbn/9781338157826-L.jpg' },
        ],
        caldecott: [
            { title: 'The Snowy Day', author: 'Ezra Jack Keats', cover: 'https://covers.openlibrary.org/b/isbn/9780670654000-L.jpg' },
            { title: 'Where the Wild Things Are', author: 'Maurice Sendak', cover: 'https://covers.openlibrary.org/b/isbn/9780060254926-L.jpg' },
            { title: 'Owl Moon', author: 'Jane Yolen', cover: 'https://covers.openlibrary.org/b/isbn/9780399214578-L.jpg' },
            { title: 'Officer Buckle and Gloria', author: 'Peggy Rathmann', cover: 'https://covers.openlibrary.org/b/isbn/9780399226168-L.jpg' },
            { title: 'Kitten\'s First Full Moon', author: 'Kevin Henkes', cover: 'https://covers.openlibrary.org/b/isbn/9780060588281-L.jpg' },
            { title: 'A Ball for Daisy', author: 'Chris Raschka', cover: 'https://covers.openlibrary.org/b/isbn/9780375858611-L.jpg' },
            { title: 'Last Stop on Market Street', author: 'Matt de la Peña', cover: 'https://covers.openlibrary.org/b/isbn/9780399257742-L.jpg' },
            { title: 'The Lion & the Mouse', author: 'Jerry Pinkney', cover: 'https://covers.openlibrary.org/b/isbn/9780316013567-L.jpg' },
        ],
        newbery: [
            { title: 'The Giver', author: 'Lois Lowry', cover: 'https://covers.openlibrary.org/b/isbn/9780544336261-L.jpg' },
            { title: 'Holes', author: 'Louis Sachar', cover: 'https://covers.openlibrary.org/b/isbn/9780374332662-L.jpg' },
            { title: 'Bridge to Terabithia', author: 'Katherine Paterson', cover: 'https://covers.openlibrary.org/b/isbn/9780064401845-L.jpg' },
            { title: 'Number the Stars', author: 'Lois Lowry', cover: 'https://covers.openlibrary.org/b/isbn/9780395510605-L.jpg' },
            { title: 'Walk Two Moons', author: 'Sharon Creech', cover: 'https://covers.openlibrary.org/b/isbn/9780064405171-L.jpg' },
            { title: 'When You Reach Me', author: 'Rebecca Stead', cover: 'https://covers.openlibrary.org/b/isbn/9780385737494-L.jpg' },
            { title: 'The Crossover', author: 'Kwame Alexander', cover: 'https://covers.openlibrary.org/b/isbn/9780544107717-L.jpg' },
            { title: 'Merci Suárez Changes Gears', author: 'Meg Medina', cover: 'https://covers.openlibrary.org/b/isbn/9780763690496-L.jpg' },
        ],
        corettascottking: [
            { title: 'Brown Girl Dreaming', author: 'Jacqueline Woodson', cover: 'https://covers.openlibrary.org/b/isbn/9780399252518-L.jpg' },
            { title: 'The Watsons Go to Birmingham', author: 'Christopher Paul Curtis', cover: 'https://covers.openlibrary.org/b/isbn/9780440414124-L.jpg' },
            { title: 'Roll of Thunder, Hear My Cry', author: 'Mildred D. Taylor', cover: 'https://covers.openlibrary.org/b/isbn/9780140384512-L.jpg' },
            { title: 'Bud, Not Buddy', author: 'Christopher Paul Curtis', cover: 'https://covers.openlibrary.org/b/isbn/9780553494105-L.jpg' },
            { title: 'One Crazy Summer', author: 'Rita Williams-Garcia', cover: 'https://covers.openlibrary.org/b/isbn/9780060760908-L.jpg' },
            { title: 'New Kid', author: 'Jerry Craft', cover: 'https://covers.openlibrary.org/b/isbn/9780062691194-L.jpg' },
            { title: 'The Parker Inheritance', author: 'Varian Johnson', cover: 'https://covers.openlibrary.org/b/isbn/9780545952781-L.jpg' },
        ],
        stem: [
            { title: 'Rosie Revere, Engineer', author: 'Andrea Beaty', cover: 'https://covers.openlibrary.org/b/isbn/9781419708459-L.jpg' },
            { title: 'Ada Twist, Scientist', author: 'Andrea Beaty', cover: 'https://covers.openlibrary.org/b/isbn/9781419721373-L.jpg' },
            { title: 'The Most Magnificent Thing', author: 'Ashley Spires', cover: 'https://covers.openlibrary.org/b/isbn/9781554537044-L.jpg' },
            { title: 'Hidden Figures', author: 'Margot Lee Shetterly', cover: 'https://covers.openlibrary.org/b/isbn/9780062742469-L.jpg' },
            { title: 'What Do You Do with an Idea?', author: 'Kobi Yamada', cover: 'https://covers.openlibrary.org/b/isbn/9781938298073-L.jpg' },
            { title: 'The Boy Who Harnessed the Wind', author: 'William Kamkwamba', cover: 'https://covers.openlibrary.org/b/isbn/9780803735118-L.jpg' },
            { title: 'If You Decide to Go to the Moon', author: 'Faith McNulty', cover: 'https://covers.openlibrary.org/b/isbn/9780590483599-L.jpg' },
            { title: 'On a Beam of Light', author: 'Jennifer Berne', cover: 'https://covers.openlibrary.org/b/isbn/9780811872355-L.jpg' },
        ],
        classics: [
            { title: 'Charlotte\'s Web', author: 'E.B. White', cover: 'https://covers.openlibrary.org/b/isbn/9780064400558-L.jpg' },
            { title: 'Where the Sidewalk Ends', author: 'Shel Silverstein', cover: 'https://covers.openlibrary.org/b/isbn/9780060256678-L.jpg' },
            { title: 'The Phantom Tollbooth', author: 'Norton Juster', cover: 'https://covers.openlibrary.org/b/isbn/9780394820378-L.jpg' },
            { title: 'A Wrinkle in Time', author: 'Madeleine L\'Engle', cover: 'https://covers.openlibrary.org/b/isbn/9780374386139-L.jpg' },
            { title: 'The Secret Garden', author: 'Frances Hodgson Burnett', cover: 'https://covers.openlibrary.org/b/isbn/9780064401883-L.jpg' },
            { title: 'James and the Giant Peach', author: 'Roald Dahl', cover: 'https://covers.openlibrary.org/b/isbn/9780142410363-L.jpg' },
            { title: 'Matilda', author: 'Roald Dahl', cover: 'https://covers.openlibrary.org/b/isbn/9780142410370-L.jpg' },
            { title: 'The BFG', author: 'Roald Dahl', cover: 'https://covers.openlibrary.org/b/isbn/9780142410387-L.jpg' },
            { title: 'Stuart Little', author: 'E.B. White', cover: 'https://covers.openlibrary.org/b/isbn/9780064400565-L.jpg' },
            { title: 'The Cricket in Times Square', author: 'George Selden', cover: 'https://covers.openlibrary.org/b/isbn/9780312380038-L.jpg' },
        ],

        // ── LEARNING GOALS (Toddler Literacy) ──
        rhyme: [
            { title: 'Chicka Chicka Boom Boom', author: 'Bill Martin Jr.', cover: 'https://covers.openlibrary.org/b/isbn/9781442450707-L.jpg' },
            { title: 'Llama Llama Red Pajama', author: 'Anna Dewdney', cover: 'https://covers.openlibrary.org/b/isbn/9780670059836-L.jpg' },
            { title: 'Each Peach Pear Plum', author: 'Janet & Allan Ahlberg', cover: 'https://covers.openlibrary.org/b/isbn/9780670882786-L.jpg' },
            { title: 'Room on the Broom', author: 'Julia Donaldson', cover: 'https://covers.openlibrary.org/b/isbn/9780142501122-L.jpg' },
            { title: 'Jamberry', author: 'Bruce Degen', cover: 'https://covers.openlibrary.org/b/isbn/9780694006519-L.jpg' },
            { title: 'Down by the Bay', author: 'Raffi', cover: 'https://covers.openlibrary.org/b/isbn/9780517566459-L.jpg' },
        ],
        animalsounds: [
            { title: 'Brown Bear, Brown Bear, What Do You See?', author: 'Bill Martin Jr.', cover: 'https://covers.openlibrary.org/b/isbn/9780805047905-L.jpg' },
            { title: 'Moo, Baa, La La La!', author: 'Sandra Boynton', cover: 'https://covers.openlibrary.org/b/isbn/9780671449018-L.jpg' },
            { title: 'Click, Clack, Moo', author: 'Doreen Cronin', cover: 'https://covers.openlibrary.org/b/isbn/9780689832130-L.jpg' },
            { title: 'Polar Bear, Polar Bear, What Do You Hear?', author: 'Bill Martin Jr.', cover: 'https://covers.openlibrary.org/b/isbn/9780805053883-L.jpg' },
            { title: 'Dear Zoo', author: 'Rod Campbell', cover: 'https://covers.openlibrary.org/b/isbn/9781416947370-L.jpg' },
            { title: 'The Pout-Pout Fish', author: 'Deborah Diesen', cover: 'https://covers.openlibrary.org/b/isbn/9780374360979-L.jpg' },
        ],
        labeling: [
            { title: 'First 100 Words', author: 'Roger Priddy', cover: 'https://covers.openlibrary.org/b/isbn/9780312510787-L.jpg' },
            { title: 'Baby Touch and Feel: Animals', author: 'DK', cover: 'https://covers.openlibrary.org/b/isbn/9780756634681-L.jpg' },
            { title: 'My First Word Book', author: 'Angela Wilkes', cover: 'https://covers.openlibrary.org/b/isbn/9781564582041-L.jpg' },
            { title: 'Toes, Ears, & Nose!', author: 'Marion Dane Bauer', cover: 'https://covers.openlibrary.org/b/isbn/9780689847127-L.jpg' },
            { title: 'From Head to Toe', author: 'Eric Carle', cover: 'https://covers.openlibrary.org/b/isbn/9780064435963-L.jpg' },
        ],
        causeeffect: [
            { title: 'Dear Zoo', author: 'Rod Campbell', cover: 'https://covers.openlibrary.org/b/isbn/9781416947370-L.jpg' },
            { title: 'Where\'s Spot?', author: 'Eric Hill', cover: 'https://covers.openlibrary.org/b/isbn/9780399240461-L.jpg' },
            { title: 'Press Here', author: 'Hervé Tullet', cover: 'https://covers.openlibrary.org/b/isbn/9780811879545-L.jpg' },
            { title: 'Pat the Bunny', author: 'Dorothy Kunhardt', cover: 'https://covers.openlibrary.org/b/isbn/9780307120007-L.jpg' },
            { title: 'Peek-a-Who?', author: 'Nina Laden', cover: 'https://covers.openlibrary.org/b/isbn/9780811826020-L.jpg' },
        ],
        patterns: [
            { title: 'The Very Hungry Caterpillar', author: 'Eric Carle', cover: 'https://covers.openlibrary.org/b/isbn/9780399226908-L.jpg' },
            { title: 'We\'re Going on a Bear Hunt', author: 'Michael Rosen', cover: 'https://covers.openlibrary.org/b/isbn/9780689853494-L.jpg' },
            { title: 'If You Give a Mouse a Cookie', author: 'Laura Numeroff', cover: 'https://covers.openlibrary.org/b/isbn/9780060245863-L.jpg' },
            { title: 'Brown Bear, Brown Bear, What Do You See?', author: 'Bill Martin Jr.', cover: 'https://covers.openlibrary.org/b/isbn/9780805047905-L.jpg' },
            { title: 'The Napping House', author: 'Audrey Wood', cover: 'https://covers.openlibrary.org/b/isbn/9780152567088-L.jpg' },
            { title: 'Goodnight Gorilla', author: 'Peggy Rathmann', cover: 'https://covers.openlibrary.org/b/isbn/9780399230035-L.jpg' },
        ],
        earlymath: [
            { title: 'Ten Little Fingers and Ten Little Toes', author: 'Mem Fox', cover: 'https://covers.openlibrary.org/b/isbn/9780152060572-L.jpg' },
            { title: 'Chicka Chicka 1, 2, 3', author: 'Bill Martin Jr.', cover: 'https://covers.openlibrary.org/b/isbn/9780689858819-L.jpg' },
            { title: 'Mouse Count', author: 'Ellen Stoll Walsh', cover: 'https://covers.openlibrary.org/b/isbn/9780152002237-L.jpg' },
            { title: 'The Very Hungry Caterpillar', author: 'Eric Carle', cover: 'https://covers.openlibrary.org/b/isbn/9780399226908-L.jpg' },
            { title: 'Five Little Monkeys Jumping on the Bed', author: 'Eileen Christelow', cover: 'https://covers.openlibrary.org/b/isbn/9780395557013-L.jpg' },
        ],
        bedtime: [
            { title: 'Goodnight Moon', author: 'Margaret Wise Brown', cover: 'https://covers.openlibrary.org/b/isbn/9780694003617-L.jpg' },
            { title: 'Time for Bed', author: 'Mem Fox', cover: 'https://covers.openlibrary.org/b/isbn/9780152010669-L.jpg' },
            { title: 'The Going to Bed Book', author: 'Sandra Boynton', cover: 'https://covers.openlibrary.org/b/isbn/9780671449025-L.jpg' },
            { title: 'Pajama Time!', author: 'Sandra Boynton', cover: 'https://covers.openlibrary.org/b/isbn/9780761119753-L.jpg' },
            { title: 'On the Night You Were Born', author: 'Nancy Tillman', cover: 'https://covers.openlibrary.org/b/isbn/9780312601553-L.jpg' },
        ],
        emotions: [
            { title: 'Llama Llama Red Pajama', author: 'Anna Dewdney', cover: 'https://covers.openlibrary.org/b/isbn/9780670059836-L.jpg' },
            { title: 'The Feelings Book', author: 'Todd Parr', cover: 'https://covers.openlibrary.org/b/isbn/9780316012492-L.jpg' },
            { title: 'Grumpy Monkey', author: 'Suzanne Lang', cover: 'https://covers.openlibrary.org/b/isbn/9780553537864-L.jpg' },
            { title: 'In My Heart: A Book of Feelings', author: 'Jo Witek', cover: 'https://covers.openlibrary.org/b/isbn/9781419713101-L.jpg' },
            { title: 'The Color Monster', author: 'Anna Llenas', cover: 'https://covers.openlibrary.org/b/isbn/9780316450010-L.jpg' },
            { title: 'When Sophie Gets Angry', author: 'Molly Bang', cover: 'https://covers.openlibrary.org/b/isbn/9780590189798-L.jpg' },
        ],
    };

    const seasonalBooks = CURATED_BOOKS.seasonal[seasonal.key] || CURATED_BOOKS.seasonal.summer;

    // Book search (ISBNdb → Google Books fallback)
    const searchGoogleBooks = async (query) => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const results = await searchBooksUnified(query, 12);
            setSearchResults(results);
        } catch (err) {
            console.warn('Book search error:', err);
            setSearchResults([]);
        }
        setSearching(false);
    };

    const BookCard = ({ book, size = 'normal' }) => (
        <div className={size === 'small' ? 'w-28 flex-shrink-0' : ''}>
            {book.cover ? (
                <img 
                    src={book.cover} 
                    alt={book.title}
                    className={`${size === 'small' ? 'w-28 h-40' : 'w-full h-44'} object-contain rounded-lg shadow-md mb-1.5 bg-gray-50`}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
            ) : null}
            <div 
                className={`${size === 'small' ? 'w-28 h-40' : 'w-full h-44'} bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg shadow-md mb-1.5 items-center justify-center`}
                style={{ display: book.cover ? 'none' : 'flex' }}
            >
                <span className="text-2xl">📖</span>
            </div>
            <p className={`${size === 'small' ? 'text-xs w-28' : 'text-xs'} text-gray-700 font-medium truncate`}>{book.title}</p>
            <p className={`${size === 'small' ? 'text-xs w-28' : 'text-xs'} text-gray-400 truncate`}>{book.author}</p>
            <button 
                onClick={() => onLogBook({ title: book.title, author: book.author, cover: book.cover })}
                className="mt-1 text-xs text-amber-700 font-medium hover:text-amber-900"
            >
                + Keep this
            </button>
        </div>
    );

    const BookRow = ({ books, title, subtitle }) => (
        <div className="mb-6">
            <div className="flex justify-between items-baseline mb-3">
                <div>
                    <h3 className="text-base font-semibold text-gray-800">{title}</h3>
                    {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
                </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                {books.map((book, i) => (
                    <BookCard key={i} book={book} size="small" />
                ))}
            </div>
        </div>
    );

    return (
        <div>
            {/* Search */}
            <div className="mb-6">
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Search for any book..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchGoogleBooks(searchQuery)}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    />
                    <button
                        onClick={() => searchGoogleBooks(searchQuery)}
                        className="px-4 py-3 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                    >
                        🔍
                    </button>
                </div>
            </div>

            {/* Search Results */}
            {searching && (
                <div className="text-center py-8">
                    <div className="text-2xl animate-pulse">📚</div>
                    <p className="text-sm text-gray-500 mt-2">Searching...</p>
                </div>
            )}

            {searchResults.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-base font-semibold text-gray-800 mb-3">Search Results</h3>
                    <div className="grid grid-cols-3 gap-3">
                        {searchResults.map((book, i) => (
                            <BookCard key={i} book={book} />
                        ))}
                    </div>
                    <button 
                        onClick={() => { setSearchResults([]); setSearchQuery(''); }}
                        className="w-full mt-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                        Clear results
                    </button>
                </div>
            )}

            {/* Curated Sections (shown when not searching) */}
            {searchResults.length === 0 && !searching && (
                <>
                    {/* Seasonal Picks */}
                    <BookRow 
                        books={seasonalBooks} 
                        title={seasonal.title}
                        subtitle="Timely picks for your family"
                    />

                    {/* Bestsellers & New */}
                    <BookRow 
                        books={CURATED_BOOKS.bestsellers} 
                        title="🔥 Popular Right Now"
                        subtitle="Kids' bestsellers & trending reads"
                    />

                    {/* Award Winners */}
                    <BookRow 
                        books={CURATED_BOOKS.caldecott} 
                        title="🏅 Caldecott Medal Winners"
                        subtitle="Best illustrated picture books"
                    />

                    <BookRow 
                        books={CURATED_BOOKS.newbery} 
                        title="🥇 Newbery Medal Winners"
                        subtitle="Outstanding children's literature"
                    />

                    <BookRow 
                        books={CURATED_BOOKS.corettascottking} 
                        title="✊ Coretta Scott King Award"
                        subtitle="Celebrating African American authors & illustrators"
                    />

                    {/* STEM */}
                    <BookRow 
                        books={CURATED_BOOKS.stem} 
                        title="🔬 STEM & Science"
                        subtitle="Inspire curiosity and discovery"
                    />

                    {/* Classics */}
                    <BookRow 
                        books={CURATED_BOOKS.classics} 
                        title="📖 Timeless Classics"
                        subtitle="Books every kid should read"
                    />

                    {/* By Age Group */}
                    <div className="mb-6">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">📖 Books by Age</h3>
                        <p className="text-xs text-gray-500 mb-3">Tap to explore</p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { key: 'board', label: '👶 Board Books', sub: '0-2 years' },
                                { key: 'picture', label: '🎨 Picture Books', sub: '2-6 years' },
                                { key: 'chapter', label: '📕 Chapter Books', sub: '6-9 years' },
                                { key: 'middlegrade', label: '📚 Middle Grade', sub: '9-12 years' },
                            ].map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setExpandedSection(expandedSection === cat.key ? null : cat.key)}
                                    className={`p-3 rounded-xl text-left transition-all ${
                                        expandedSection === cat.key 
                                            ? 'bg-amber-100 border-2 border-amber-300' 
                                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="text-sm font-medium text-gray-800">{cat.label}</div>
                                    <div className="text-xs text-gray-500">{cat.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Expanded age section */}
                    {expandedSection && ['board','picture','chapter','middlegrade'].includes(expandedSection) && CURATED_BOOKS[expandedSection] && (
                        <div className="mb-6">
                            <div className="grid grid-cols-3 gap-3">
                                {CURATED_BOOKS[expandedSection].map((book, i) => (
                                    <BookCard key={i} book={book} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── LEARNING GOALS ── */}
                    <div className="mb-6">
                        <h3 className="text-base font-semibold text-gray-800 mb-1">🧒 Early Literacy Goals</h3>
                        <p className="text-xs text-gray-500 mb-3">Books that build real reading skills — tap to explore</p>
                        
                        {/* Sounds & Language */}
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">🔊 Sounds & Language</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                                { key: 'rhyme', label: '🎵 Rhyme & Rhythm', sub: 'Hearing sounds in words' },
                                { key: 'animalsounds', label: '🐻 Animal Sounds', sub: 'Voice & mouth muscles' },
                            ].map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setExpandedSection(expandedSection === cat.key ? null : cat.key)}
                                    className={`p-3 rounded-xl text-left transition-all ${
                                        expandedSection === cat.key 
                                            ? 'bg-amber-100 border-2 border-amber-300' 
                                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="text-sm font-medium text-gray-800">{cat.label}</div>
                                    <div className="text-xs text-gray-500">{cat.sub}</div>
                                </button>
                            ))}
                        </div>

                        {/* Print Awareness */}
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">📖 Print Awareness</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                                { key: 'labeling', label: '🏷️ Object Labeling', sub: 'Building a word bank' },
                                { key: 'causeeffect', label: '🎪 Cause & Effect', sub: 'Lift-the-flap & interactive' },
                            ].map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setExpandedSection(expandedSection === cat.key ? null : cat.key)}
                                    className={`p-3 rounded-xl text-left transition-all ${
                                        expandedSection === cat.key 
                                            ? 'bg-amber-100 border-2 border-amber-300' 
                                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="text-sm font-medium text-gray-800">{cat.label}</div>
                                    <div className="text-xs text-gray-500">{cat.sub}</div>
                                </button>
                            ))}
                        </div>

                        {/* Cognitive & Narrative */}
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">🧠 Cognitive & Narrative</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                                { key: 'patterns', label: '🔁 Predictable Patterns', sub: 'Finish-the-sentence books' },
                                { key: 'earlymath', label: '🔢 Early Math & Logic', sub: 'Counting, shapes, sizes' },
                            ].map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setExpandedSection(expandedSection === cat.key ? null : cat.key)}
                                    className={`p-3 rounded-xl text-left transition-all ${
                                        expandedSection === cat.key 
                                            ? 'bg-amber-100 border-2 border-amber-300' 
                                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="text-sm font-medium text-gray-800">{cat.label}</div>
                                    <div className="text-xs text-gray-500">{cat.sub}</div>
                                </button>
                            ))}
                        </div>

                        {/* Social-Emotional */}
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">💛 Social-Emotional</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                                { key: 'bedtime', label: '😴 Bedtime & Comfort', sub: 'Calming routines' },
                                { key: 'emotions', label: '🌈 Big Feelings', sub: 'Naming & managing emotions' },
                            ].map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setExpandedSection(expandedSection === cat.key ? null : cat.key)}
                                    className={`p-3 rounded-xl text-left transition-all ${
                                        expandedSection === cat.key 
                                            ? 'bg-amber-100 border-2 border-amber-300' 
                                            : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                                    }`}
                                >
                                    <div className="text-sm font-medium text-gray-800">{cat.label}</div>
                                    <div className="text-xs text-gray-500">{cat.sub}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Expanded learning goal section */}
                    {expandedSection && CURATED_BOOKS[expandedSection] && !['board','picture','chapter','middlegrade'].includes(expandedSection) && (
                        <div className="mb-6 -mt-4">
                            <div className="grid grid-cols-3 gap-3">
                                {CURATED_BOOKS[expandedSection].map((book, i) => (
                                    <BookCard key={i} book={book} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// Progress View Component
function ProgressView({ children, logs, onOpenSettings, familyProfile, selectedChild, onSelectChild, updateChildGoal, onGenerateReport, onShareCard }) {
    const [showEditGoal, setShowEditGoal] = useState(false);

    if (children.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a reader first</h3>
                <p className="text-sm text-gray-400">
                    Set up your readers in{' '}
                    <button onClick={onOpenSettings} className="text-amber-700 hover:text-amber-900 underline font-medium">
                        Home
                    </button>
                    {' '}to start saving stories
                </p>
            </div>
        );
    }

    const childId = selectedChild || children[0]?.id;
    const child = children.find(c => c.id === childId);
    const childLogs = logs.filter(l => l.childId === childId);
    const allLogs = logs;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // === WEEKLY GOAL ===
    const goal = child?.goal || { minutesPerDay: 20, daysPerWeek: 5 };
    const weekStart = getWeekStart();
    const weekLogs = childLogs.filter(l => new Date(l.date) >= weekStart);
    const weekMinutes = weekLogs.reduce((sum, l) => sum + (l.minutes || 0), 0);
    const weeklyGoalMinutes = goal.minutesPerDay * goal.daysPerWeek;
    const goalProgress = weeklyGoalMinutes > 0
        ? Math.min(100, Math.round((weekMinutes / weeklyGoalMinutes) * 100))
        : 0;
    const daysReadThisWeekChild = new Set(weekLogs.map(l => l.date)).size;
    const daysNeeded = Math.max(0, goal.daysPerWeek - daysReadThisWeekChild);

    // === THIS WEEK STATS (all children) ===
    const allWeekLogs = allLogs.filter(l => new Date(l.date) >= weekStart);
    const weekBooks = new Set(allWeekLogs.map(l => (l.bookTitle || '').split(' by ')[0])).size;
    const allWeekMinutes = allWeekLogs.reduce((sum, l) => sum + (l.minutes || 0), 0);
    const weekHours = Math.floor(allWeekMinutes / 60);
    const weekRemainMin = allWeekMinutes % 60;

    // === READING STREAK (calendar) ===
    const daysWithReading = new Set(allLogs.map(l => l.date));
    const weekDays = [];
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        weekDays.push({
            label: dayLabels[i],
            date: dateStr,
            hasReading: daysWithReading.has(dateStr),
            isToday: dateStr === todayStr,
            isPast: d <= today
        });
    }
    const daysReadThisWeek = weekDays.filter(d => d.hasReading).length;

    // Streak calculation
    let streak = 0;
    const checkDate = new Date(today);
    while (true) {
        const ds = checkDate.toISOString().split('T')[0];
        if (daysWithReading.has(ds)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else if (streak === 0) {
            checkDate.setDate(checkDate.getDate() - 1);
            const ys = checkDate.toISOString().split('T')[0];
            if (daysWithReading.has(ys)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else { break; }
        } else { break; }
    }

    // === MILESTONES ===
    const totalBooksRead = new Set(allLogs.map(l => (l.bookTitle || '').split(' by ')[0])).size;
    const totalMinutes = allLogs.reduce((sum, l) => sum + (l.minutes || 0), 0);
    const milestones = [];
    if (allLogs.length > 0) {
        const firstLog = [...allLogs].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        const firstTitle = (firstLog.bookTitle || '').split(' by ')[0];
        milestones.push({ icon: '📖', text: `First Book Logged! "${firstTitle}"` });
    }
    if (totalBooksRead >= 50) milestones.push({ icon: '🏆', text: '50 Books Read!' });
    else if (totalBooksRead >= 25) milestones.push({ icon: '⭐', text: '25 Books Read!' });
    else if (totalBooksRead >= 10) milestones.push({ icon: '🎉', text: '10 Books Read!' });
    else if (totalBooksRead >= 5) milestones.push({ icon: '📚', text: '5 Books Read!' });
    if (totalMinutes >= 600) milestones.push({ icon: '⏰', text: '10 Hours of Reading!' });
    else if (totalMinutes >= 300) milestones.push({ icon: '⏰', text: '5 Hours of Reading!' });
    else if (totalMinutes >= 60) milestones.push({ icon: '⏰', text: '1 Hour of Reading!' });
    if (streak >= 3) milestones.push({ icon: '🔥', text: `Reading Streak: ${streak} days in a row!` });

    // === MOST READ AUTHORS ===
    const authorCounts = {};
    allLogs.forEach(l => {
        const parts = (l.bookTitle || '').split(' by ');
        if (parts.length > 1) {
            const author = parts.slice(1).join(' by ').trim();
            if (author) {
                const bookTitle = parts[0].trim();
                if (!authorCounts[author]) authorCounts[author] = new Set();
                authorCounts[author].add(bookTitle);
            }
        }
    });
    const topAuthors = Object.entries(authorCounts)
        .map(([name, books]) => ({ name, count: books.size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    const authorMedals = ['🥇', '🥈', '🥉'];

    // === READING TIME TRENDS ===
    const weeklyData = [];
    for (let w = 3; w >= 0; w--) {
        const ws = new Date(weekStart);
        ws.setDate(ws.getDate() - (w * 7));
        const we = new Date(ws);
        we.setDate(we.getDate() + 7);
        const mins = allLogs
            .filter(l => { const d = new Date(l.date); return d >= ws && d < we; })
            .reduce((sum, l) => sum + (l.minutes || 0), 0);
        weeklyData.push({ label: w === 0 ? 'This Week' : `${w} wk ago`, minutes: mins });
    }
    const maxWeekMin = Math.max(...weeklyData.map(w => w.minutes), 1);

    return (
        <div>
            {/* CHILD SELECTOR */}
            {children.length > 1 && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reader</label>
                    <select 
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        value={childId}
                        onChange={(e) => onSelectChild(e.target.value)}
                    >
                        {children.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
            )}

            <h2 className="text-xl font-semibold mb-4">{child?.name}'s Progress</h2>

            {/* WEEKLY READING GOAL */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-200 rounded-xl p-4 mb-5">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="font-semibold text-gray-800">📖 Weekly Reading Goal</h3>
                        <p className="text-sm text-amber-700">
                          {(goal.minutesPerDay > 0 && goal.daysPerWeek > 0)
                            ? (<>{goal.minutesPerDay} min/day · {goal.daysPerWeek} days/week</>)
                            : (<>No goal set yet</>)
                          }
                        </p>
                    </div>
                    <button 
                        onClick={() => setShowEditGoal(true)}
                        className="text-sm text-amber-700 font-medium hover:text-amber-900"
                    >Edit Goal</button>
                </div>
                <div className="flex justify-between text-sm text-amber-800 mb-1">
                    <span>{weekMinutes} of {weeklyGoalMinutes} minutes</span>
                    <span>{goalProgress}%</span>
                </div>
                <div className="w-full bg-amber-200 rounded-full h-3 mb-2">
                    <div 
                        className="bg-amber-600 rounded-full h-3 transition-all"
                        style={{ width: `${goalProgress}%` }}
                    />
                </div>
                <p className="text-sm text-amber-800">
                    {goalProgress >= 100 
                        ? '🎉 Goal reached! Amazing job!' 
                        : `Read ${daysNeeded} more day${daysNeeded !== 1 ? 's' : ''} this week`
                    }
                </p>
            </div>

            {/* 1. MILESTONES */}
            {milestones.length > 0 && (
                <div className="mb-5 bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4">
                    <h3 className="text-base font-semibold text-amber-800 mb-3">🎉 Milestones</h3>
                    <div className="space-y-2">
                        {milestones.map((m, i) => (
                            <div key={i} className="flex items-start gap-2">
                                <span className="text-lg">{m.icon}</span>
                                <span className="text-sm text-amber-900 font-medium">{m.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. THIS WEEK */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl p-4 text-white text-center">
                    <div className="text-3xl font-bold">{weekBooks}</div>
                    <div className="text-xs font-medium opacity-85 mt-1">Books Read</div>
                </div>
                <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl p-4 text-white text-center">
                    <div className="text-3xl font-bold">
                        {weekHours > 0 ? `${weekHours}h ${weekRemainMin}m` : `${allWeekMinutes}m`}
                    </div>
                    <div className="text-xs font-medium opacity-85 mt-1">Total Time</div>
                </div>
            </div>

            {/* 3. READING STREAK */}
            <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-base font-semibold text-gray-800">Reading Streak</h3>
                <p className="text-sm text-gray-500 mb-3">
                    {daysReadThisWeek > 0 
                        ? `You've read ${daysReadThisWeek} day${daysReadThisWeek !== 1 ? 's' : ''} this week! 🎉`
                        : 'Start reading to build your streak!'
                    }
                </p>
                <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day, i) => (
                        <div key={i} className="text-center">
                            <div className="text-xs text-gray-500 font-medium mb-1">{day.label}</div>
                            <div className={`w-9 h-9 mx-auto rounded-full flex items-center justify-center text-sm font-bold ${
                                day.hasReading 
                                    ? 'bg-amber-600 text-white' 
                                    : day.isPast 
                                        ? 'bg-gray-100 text-gray-400' 
                                        : 'bg-gray-50 text-gray-300'
                            } ${day.isToday ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}>
                                {day.hasReading ? '✓' : ''}
                            </div>
                        </div>
                    ))}
                </div>
                {streak > 0 && (
                    <div className="mt-3 text-center">
                        <span className="inline-block px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                            🔥 {streak} day streak
                        </span>
                    </div>
                )}
            </div>

            {/* 4. MOST READ AUTHORS */}
            {topAuthors.length > 0 && (
                <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="text-base font-semibold text-gray-800 mb-3">Most Read Authors</h3>
                    <div className="space-y-2">
                        {topAuthors.map((author, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="text-lg w-6 text-center">{authorMedals[i] || '📖'}</span>
                                <span className="text-sm font-medium text-gray-800 flex-1">{author.name}</span>
                                <span className="text-xs text-gray-500">{author.count} book{author.count !== 1 ? 's' : ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 5. READING TIME TRENDS */}
            <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-base font-semibold text-gray-800">Reading Time Trends</h3>
                <p className="text-sm text-gray-500 mb-4">Minutes read per week</p>
                <div className="flex items-end gap-3 h-32">
                    {weeklyData.map((week, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center">
                            <div className="text-xs text-gray-600 font-semibold mb-1">
                                {week.minutes > 0 ? `${week.minutes}m` : ''}
                            </div>
                            <div 
                                className="w-full rounded-t-md bg-gradient-to-t from-amber-600 to-amber-400 transition-all"
                                style={{ 
                                    height: `${Math.max((week.minutes / maxWeekMin) * 100, week.minutes > 0 ? 8 : 2)}%`,
                                    minHeight: week.minutes > 0 ? '12px' : '3px'
                                }}
                            />
                            <div className="text-xs text-gray-500 mt-2 text-center leading-tight">{week.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            

            {/* Total stats summary */}
            <div className="text-center text-sm text-gray-500 mb-4">
                <span className="font-medium">{totalBooksRead} books</span> · <span className="font-medium">{Math.round(totalMinutes / 60)}h {totalMinutes % 60}m</span> total reading time
            </div>

            {/* Edit Goal Modal */}
            {showEditGoal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEditGoal(false)}>
                    <div className="absolute inset-0 bg-black bg-opacity-30" />
                    <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">Edit Reading Goal</h3>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Minutes per day</label>
                            <input 
                                type="number" 
                                defaultValue={goal.minutesPerDay || 20}
                                id="edit-goal-minutes"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Days per week</label>
                            <input 
                                type="number" 
                                defaultValue={goal.daysPerWeek || 5}
                                id="edit-goal-days"
                                min="1" max="7"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowEditGoal(false)}
                                className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600"
                            >Cancel</button>
                            <button 
                                onClick={() => {
                                    const mins = parseInt(document.getElementById('edit-goal-minutes').value) || 20;
                                    const days = Math.min(7, Math.max(1, parseInt(document.getElementById('edit-goal-days').value) || 5));
                                    updateChildGoal(childId, mins, days);
                                    setShowEditGoal(false);
                                }}
                                className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                            >Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}




// Bookshelf View Component - Visual grid of all books read
function BookshelfView({ children, logs, onOpenSettings, familyProfile }) {
    const [bookshelfChild, setBookshelfChild] = useState('all');
    const babyEmoji = familyProfile?.babyEmoji || '👶';

    if (children.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="text-6xl mb-4">{babyEmoji}</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a reader first</h3>
                <p className="text-sm text-gray-400">
                    Set up your readers in{' '}
                    <button onClick={onOpenSettings} className="text-amber-700 hover:text-amber-900 underline font-medium">
                        Home
                    </button>
                    {' '}to start saving stories
                </p>
            </div>
        );
    }

    const filteredLogs = bookshelfChild === 'all' ? logs : logs.filter(l => l.childId === bookshelfChild);
    const books = [...new Map(filteredLogs.map(l => [l.bookTitle, l])).values()];
    const selectedChildObj = children.find(c => c.id === bookshelfChild);
    const displayName = bookshelfChild === 'all' ? 'Everyone' : (selectedChildObj?.name || 'Unknown');

    return (
        <div>
            {/* Reader Selector */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Reader</label>
                <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    value={bookshelfChild}
                    onChange={(e) => setBookshelfChild(e.target.value)}
                >
                    <option value="all">All Readers</option>
                    {children.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{displayName}'s Bookshelf</h2>
                <span className="text-sm text-gray-500">{books.length} books</span>
            </div>

            {books.length === 0 ? (
                <div className="text-center py-10">
                    <div className="text-4xl mb-3">📚</div>
                    <h3 className="text-lg text-gray-600 mb-2">Your shelf is waiting</h3>
                    <p className="text-sm text-gray-400">Save a story to start building your bookshelf!</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-4">
                    {books.map((log, i) => (
                        <div key={i} className="text-center">
                            {log.coverUrl ? (
                                <img 
                                    src={log.coverUrl} 
                                    alt={log.bookTitle}
                                    className="w-full h-40 object-contain rounded-lg shadow-md bg-white"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                />
                            ) : null}
                            <div 
                                className="w-full h-40 bg-gradient-to-br from-amber-100 to-amber-200 rounded-lg shadow-md items-center justify-center"
                                style={{ display: log.coverUrl ? 'none' : 'flex' }}
                            >
                                <span className="text-2xl">📖</span>
                            </div>
                            <p className="text-xs font-medium text-gray-700 mt-2 truncate">{(log.bookTitle || '').split(' by ')[0]}</p>
                            <p className="text-xs text-gray-400 truncate">{(log.bookTitle || '').includes(' by ') ? (log.bookTitle || '').split(' by ')[1] : ''}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Add Child Modal
function AddChildModal({ onClose, onAdd }) {
    const [name, setName] = useState('');
    const [grade, setGrade] = useState('');
    const [childType, setChildType] = useState('student');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            const success = onAdd(name.trim(), grade.trim(), childType);
            if (success !== false) {
                // Only close if validation passed
                onClose();
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">Add a Reader</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Reader's name"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Age Group *</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={childType}
                            onChange={(e) => setChildType(e.target.value)}
                        >
                            <option value="baby">👶 Baby (0-18 months)</option>
                            <option value="toddler">🧒 Toddler (18 mo - 3 years)</option>
                            <option value="preschool">🎨 Preschool (3-5 years)</option>
                            <option value="student">🎒 Student (K-12)</option>
                            <option value="homeschool">🏠 Homeschool Student</option>
                        </select>
                    </div>

                    {(childType === 'student' || childType === 'homeschool') && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Grade (optional)</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                value={grade}
                                onChange={(e) => setGrade(e.target.value)}
                                placeholder="e.g., 2nd, K, 5"
                            />
                            
                        
                            <div className="text-xs text-gray-500 mt-2">Set goals later in Home.</div>
</div>
                    )}

                    {(childType === 'baby' || childType === 'toddler') && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                            <div className="text-sm font-medium text-blue-900 mb-2">
                                👶 Read to Baby Mode
                            </div>
                            <ul className="text-sm text-blue-700 space-y-1">
                                <li>✓ Track time reading together</li>
                                <li>✓ Build early literacy habits</li>
                                <li>✓ Celebrate milestones</li>
                                <li>✓ No pressure - just bonding time!</li>
                            </ul>
                        </div>
                    )}

                    {childType === 'homeschool' && (
                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                            <div className="text-sm font-medium text-green-900 mb-2">
                                🏠 Homeschool Features
                            </div>
                            <ul className="text-sm text-green-700 space-y-1">
                                <li>✓ Subject tagging for portfolios</li>
                                <li>✓ Reading time</li>
                                <li>✓ State-compliant reports</li>
                                <li>✓ Co-op group support</li>
                            </ul>
                        </div>
                    )}

                    <button type="submit" className="w-full bg-amber-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-amber-700 transition-all mb-2">
                        Add Reader
                    </button>
                    <button 
                        type="button" 
                        className="w-full bg-gray-200 text-gray-700 py-3.5 px-6 rounded-lg font-medium hover:bg-gray-300 transition-all"
                        onClick={onClose}
                    >
                        Back to Home
                    </button>
                </form>
            </div>
        </div>
    );
}

// Edit Child Modal
function EditChildModal({ child, onClose, onSave }) {
    const [name, setName] = useState(child.name || '');
    const [grade, setGrade] = useState(child.grade || '');
    const [childType, setChildType] = useState(child.childType || 'student');
    const [goalMinutes, setGoalMinutes] = useState(child.goal?.minutesPerDay || 20);
    const [goalDays, setGoalDays] = useState(child.goal?.daysPerWeek || 5);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        onSave({
            name: name.trim(),
            grade: grade.trim(),
            childType,
            goal: {
                minutesPerDay: parseInt(goalMinutes) || 20,
                daysPerWeek: parseInt(goalDays) || 5,
                isCustom: true
            }
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-[60]" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">Edit {child.name}'s Profile</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Age Group</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={childType}
                            onChange={(e) => setChildType(e.target.value)}
                        >
                            <option value="baby">👶 Baby (0-18 months)</option>
                            <option value="toddler">🧒 Toddler (18 mo - 3 years)</option>
                            <option value="preschool">🎨 Preschool (3-5 years)</option>
                            <option value="student">🎒 Student (K-12)</option>
                            <option value="homeschool">🏠 Homeschool Student</option>
                        </select>
                    </div>

                    {(childType === 'student' || childType === 'homeschool') && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Grade</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                value={grade}
                                onChange={(e) => setGrade(e.target.value)}
                                placeholder="e.g., 2nd, K, 5"
                            />
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">📖 Daily Reading Goal</label>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Minutes/day</label>
                                <input
                                    type="number"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    value={goalMinutes}
                                    onChange={(e) => setGoalMinutes(e.target.value)}
                                    min="1"
                                    max="120"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">Days/week</label>
                                <input
                                    type="number"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    value={goalDays}
                                    onChange={(e) => setGoalDays(e.target.value)}
                                    min="1"
                                    max="7"
                                />
                            </div>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-amber-600 text-white py-3.5 rounded-lg font-medium hover:bg-amber-700 transition-all mb-2">
                        Save Changes
                    </button>
                    <button 
                        type="button" 
                        onClick={onClose}
                        className="w-full py-2 text-gray-500 text-sm"
                    >
                        Cancel
                    </button>
                </form>
            </div>
        </div>
    );
}

// Add Log Modal
function AddLogModal({ children, logs, onClose, onAdd, prefillBook }) {
    const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || '');
    const [bookTitle, setBookTitle] = useState(prefillBook?.title || '');
    const [minutes, setMinutes] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState('');
    const [coverUrl, setCoverUrl] = useState(prefillBook?.cover || null);
    const [coverLoading, setCoverLoading] = useState(false);
    const [chapterCurrent, setChapterCurrent] = useState('');
    const [chapterTotal, setChapterTotal] = useState('');
    const [bookType, setBookType] = useState('picture'); // 'picture' or 'chapter'
    const [timesRead, setTimesRead] = useState(1);
    const [isFinished, setIsFinished] = useState(false);

    // Look up last chapter data for a book
    const prefillChaptersFromHistory = (title) => {
        if (!title || !logs.length) return;
        const titleLower = title.toLowerCase();
        const bookLogs = logs
            .filter(l => {
                const logTitle = (l.bookTitle || '').toLowerCase();
                return (logTitle === titleLower || logTitle.startsWith(titleLower) || titleLower.startsWith(logTitle)) 
                    && l.chapterCurrent > 0 && l.chapterTotal > 0;
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        if (bookLogs.length > 0) {
            const last = bookLogs[0];
            setChapterCurrent(String(last.chapterCurrent));
            setChapterTotal(String(last.chapterTotal));
            setBookType('chapter');
        }
    };

    // Pre-fill chapters if opening with a prefillBook
    useEffect(() => {
        if (prefillBook?.title) {
            prefillChaptersFromHistory(prefillBook.title);
        }
    }, []);

    const quickMinutes = bookType === 'chapter' ? [15, 20, 30, 60] : [10, 15, 20, 30];
    
    // Check if selected child is older (student/homeschool)
    const selectedChild = children.find(c => c.id === selectedChildId);

    // Check if on iOS (speech recognition doesn't work on iOS browsers)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    
    // Check if speech recognition is supported (and not on iOS where it's blocked)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isSpeechSupported = !!SpeechRecognition && !isIOS;

    // Get recently used books from logs
    const getRecentBooks = () => {
        const bookTitles = logs.map(log => log.bookTitle);
        const uniqueBooks = [...new Set(bookTitles)];
        return uniqueBooks.slice(0, 5);
    };

    // Search books (ISBNdb → Google Books fallback)
    const searchBooks = async (query) => {
        if (query.length < 2) {
            setSuggestions([]);
            return;
        }

        setIsSearching(true);
        
        try {
            const results = await searchBooksUnified(query, 8);
            setSuggestions(results.filter(b => b.title));
        } catch (error) {
            console.error('Book search failed:', error);
            setSuggestions([]);
        }
        
        setIsSearching(false);
    };

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (bookTitle && showSuggestions) {
                searchBooks(bookTitle);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [bookTitle]);

    const handleBookTitleChange = (e) => {
        setBookTitle(e.target.value);
        setShowSuggestions(true);
    };

    const selectBook = async (title, author, existingCoverUrl) => {
        const fullTitle = author ? `${title} by ${author}` : title;
        setBookTitle(fullTitle);
        setShowSuggestions(false);
        setSuggestions([]);
        
        // Pre-fill chapter data from previous sessions
        prefillChaptersFromHistory(fullTitle);
        
        // Use existing cover URL if provided (from Google search), otherwise fetch
        if (existingCoverUrl) {
            setCoverUrl(existingCoverUrl);
        } else {
            setCoverLoading(true);
            const cover = await fetchBookCover(title);
            if (cover) setCoverUrl(cover);
            setCoverLoading(false);
        }
    };

    // Fetch cover when book title changes (debounced)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (bookTitle && bookTitle.length > 3 && !showSuggestions) {
                setCoverLoading(true);
                const cover = await fetchBookCover(bookTitle);
                if (cover) setCoverUrl(cover);
                setCoverLoading(false);
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [bookTitle]);

    // Voice logging functionality
    const startVoiceLogging = async () => {
        if (!SpeechRecognition) {
            setVoiceError('Voice input not supported in this browser');
            return;
        }

        // Request microphone permission first (important for iOS)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop()); // Release the stream
        } catch (err) {
            setVoiceError('Microphone access denied. Please allow microphone access in your browser settings.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        setIsListening(true);
        setVoiceError('');

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase();
            parseVoiceInput(transcript);
        };

        recognition.onerror = (event) => {
            setIsListening(false);
            let errorMessage = 'Could not understand. Please try again.';
            
            switch(event.error) {
                case 'no-speech':
                    errorMessage = 'No speech detected. Please try again.';
                    break;
                case 'audio-capture':
                    errorMessage = 'No microphone found. Please check your device.';
                    break;
                case 'not-allowed':
                    errorMessage = 'Microphone access denied. Please allow access in Settings > Safari > Microphone.';
                    break;
                case 'network':
                    errorMessage = 'Network error. Please check your connection.';
                    break;
                case 'aborted':
                    errorMessage = 'Voice input was cancelled.';
                    break;
                default:
                    errorMessage = `Could not understand. Please try again. (${event.error})`;
            }
            
            setVoiceError(errorMessage);
            console.error('Speech recognition error:', event.error);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        try {
            recognition.start();
        } catch (err) {
            setIsListening(false);
            setVoiceError('Could not start voice input. Please try again.');
            console.error('Speech start error:', err);
        }
    };

    // Parse voice input like "Emma Charlotte's Web 20 minutes"
    const parseVoiceInput = (transcript) => {

        // Try to extract minutes
        let extractedMinutes = '';
        const minutePatterns = [
            /(\d+)\s*minutes?/i,
            /(\d+)\s*mins?/i,
            /(twenty|thirty|forty|fifty|fifteen|ten|five)\s*minutes?/i,
            /half\s*hour/i,
            /(\d+)/
        ];

        for (const pattern of minutePatterns) {
            const match = transcript.match(pattern);
            if (match) {
                if (match[0].includes('half hour')) {
                    extractedMinutes = '30';
                } else if (match[1]) {
                    // Convert word numbers to digits
                    const wordToNumber = {
                        'five': '5', 'ten': '10', 'fifteen': '15', 
                        'twenty': '20', 'thirty': '30', 'forty': '40', 
                        'fifty': '50', 'sixty': '60'
                    };
                    extractedMinutes = wordToNumber[match[1]] || match[1];
                }
                break;
            }
        }

        // Try to match child name
        let matchedChildId = selectedChildId;
        for (const child of children) {
            if (transcript.includes(child.name.toLowerCase())) {
                matchedChildId = child.id;
                break;
            }
        }

        // Extract book title (remove child name and minutes from transcript)
        let extractedTitle = transcript;
        
        // Remove child name
        children.forEach(child => {
            extractedTitle = extractedTitle.replace(child.name.toLowerCase(), '');
        });
        
        // Remove minutes phrases
        extractedTitle = extractedTitle
            .replace(/\d+\s*minutes?/gi, '')
            .replace(/\d+\s*mins?/gi, '')
            .replace(/half\s*hour/gi, '')
            .replace(/for\s*$/gi, '')
            .replace(/read\s*/gi, '')
            .trim();

        // Capitalize first letter of each word for book title
        if (extractedTitle) {
            extractedTitle = extractedTitle
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }

        // Update form fields
        if (matchedChildId) setSelectedChildId(matchedChildId);
        if (extractedTitle) setBookTitle(extractedTitle);
        if (extractedMinutes) setMinutes(extractedMinutes);

        // Show success message
        if (extractedTitle || extractedMinutes) {
            setVoiceError('');
        } else {
            setVoiceError('Try saying: "Child name, book title, number minutes"');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (selectedChildId && bookTitle.trim() && minutes) {
            onAdd(selectedChildId, bookTitle.trim(), minutes, date, null, null, coverUrl, timesRead, isFinished, chapterCurrent, chapterTotal);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">📖 Log a Reading Session</h2>
                
                {/* Voice Input Section */}
                {isSpeechSupported && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-amber-50 to-amber-100 rounded-xl border-2 border-amber-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">🎤</span>
                                <span className="text-sm font-semibold text-amber-900">Quick Voice Log</span>
                            </div>
                        </div>
                        <p className="text-xs text-amber-800 mb-3">
                            Say: "Emma, Charlotte's Web, 20 minutes"
                        </p>
                        <button
                            type="button"
                            onClick={startVoiceLogging}
                            disabled={isListening}
                            className={`w-full py-3 rounded-lg font-medium transition-all ${
                                isListening 
                                    ? 'bg-red-500 text-white animate-pulse' 
                                    : 'bg-amber-600 text-white hover:bg-amber-700'
                            }`}
                        >
                            {isListening ? '🎤 Listening...' : '🎤 Start Voice Input'}
                        </button>
                        {voiceError && (
                            <p className="text-xs text-red-600 mt-2">{voiceError}</p>
                        )}
                    </div>
                )}

                {/* iOS Notice */}
                {isIOS && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-700 text-center">
                            📱 Voice button unavailable on iPhone/iPad.<br />
                            <span className="font-medium">Tip: Tap 🎤 on your keyboard to dictate!</span>
                        </p>
                    </div>
                )}

                <div className="text-xs text-gray-400 text-center mb-4">
                    {isSpeechSupported ? 'Or fill in manually below:' : 'Fill in the form below:'}
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Child *</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={selectedChildId}
                            onChange={(e) => setSelectedChildId(e.target.value)}
                            required
                        >
                            {children.map(child => (
                                <option key={child.id} value={child.id}>
                                    {child.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-4 relative">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Book Title *</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={bookTitle}
                            onChange={handleBookTitleChange}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                            placeholder="Start typing a book title..."
                            required
                        />
                        
                        {/* Autocomplete Dropdown */}
                        {showSuggestions && (bookTitle.length > 0 || getRecentBooks().length > 0) && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                {/* Recent Books */}
                                {bookTitle.length === 0 && getRecentBooks().length > 0 && (
                                    <div>
                                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
                                            📚 Recent Books
                                        </div>
                                        {getRecentBooks().map((book, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-gray-100 transition-colors"
                                                onClick={() => selectBook(book, '')}
                                            >
                                                <div className="text-sm text-gray-800">{book}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Search Results */}
                                {bookTitle.length > 0 && (
                                    <div>
                                        {isSearching ? (
                                            <div className="px-3 py-4 text-sm text-gray-500 text-center">
                                                Searching books...
                                            </div>
                                        ) : suggestions.length > 0 ? (
                                            <>
                                                <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b">
                                                    🔍 Suggestions
                                                </div>
                                                {suggestions.map((book, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-gray-100 transition-colors flex items-center gap-3"
                                                        onClick={() => selectBook(book.title, book.author, book.coverUrl)}
                                                    >
                                                        {book.coverUrl && (
                                                            <img 
                                                                src={book.coverUrl} 
                                                                alt=""
                                                                className="w-8 h-12 object-contain bg-white rounded shadow-sm"
                                                                onError={(e) => e.target.style.display = 'none'}
                                                            />
                                                        )}
                                                        <div className="flex-1">
                                                            <div className="text-sm font-medium text-gray-800">
                                                                {book.title}
                                                            </div>
                                                            {book.author && (
                                                                <div className="text-xs text-gray-500">
                                                                    by {book.author}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="px-3 py-4 text-sm text-gray-500 text-center">
                                                No books found. Keep typing or enter manually.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Book Cover Preview */}
                    {(coverUrl || coverLoading) && (
                        <div className="mb-4 flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                            {coverLoading ? (
                                <div className="w-16 h-24 bg-gray-200 rounded animate-pulse flex items-center justify-center">
                                    <span className="text-xs text-gray-400">Loading...</span>
                                </div>
                            ) : coverUrl ? (
                                <img 
                                    src={coverUrl} 
                                    alt="Book cover" 
                                    className="w-16 h-24 object-contain bg-white rounded shadow-md"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        setCoverUrl(null);
                                    }}
                                />
                            ) : null}
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-700">Cover found!</p>
                                <p className="text-xs text-gray-500">This will be saved with your log</p>
                            </div>
                        </div>
                    )}

                    {/* Book type toggle */}
                    <div className="mb-4">
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setBookType('picture')}
                                className={`flex-1 py-2.5 text-sm font-medium transition-all ${
                                    bookType === 'picture'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-white text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                🖼️ Picture book
                            </button>
                            <button
                                type="button"
                                onClick={() => { setBookType('chapter'); setTimesRead(1); }}
                                className={`flex-1 py-2.5 text-sm font-medium transition-all ${
                                    bookType === 'chapter'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-white text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                📖 Chapter book
                            </button>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Minutes *</label>
                        <input
                            type="number"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={minutes}
                            onChange={(e) => setMinutes(e.target.value)}
                            placeholder="How long?"
                            min="1"
                            required
                        />
                        <div className="grid grid-cols-4 gap-2 mt-2">
                            {quickMinutes.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                                        minutes == m 
                                            ? 'bg-amber-600 text-white border-2 border-amber-600' 
                                            : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-amber-600 hover:text-white hover:border-amber-600'
                                    }`}
                                    onClick={() => setMinutes(m.toString())}
                                >
                                    {m >= 60 ? `${m / 60}hr` : `${m}m`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Rereads - picture books only */}
                    {bookType === 'picture' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                                How many rereads?
                            </label>
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:border-amber-500 hover:text-amber-600 transition-all"
                                    onClick={() => setTimesRead(Math.max(1, timesRead - 1))}
                                >
                                    −
                                </button>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-bold" style={{ color: '#C4873A' }}>{timesRead}</span>
                                    <span className="text-sm text-gray-500 font-medium">{timesRead === 1 ? 'time' : 'times'}</span>
                                </div>
                                <button
                                    type="button"
                                    className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:border-amber-500 hover:text-amber-600 transition-all"
                                    onClick={() => setTimesRead(Math.min(10, timesRead + 1))}
                                >
                                    +
                                </button>
                            </div>
                            <div className="text-center mt-1">
                                <span className="text-xs text-gray-400 italic">
                                    {timesRead === 2 ? '"Again!"' : timesRead === 3 ? '"One more time!"' : timesRead >= 4 ? 'A true favorite 🥰' : ''}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Chapter book options */}
                    {bookType === 'chapter' && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-3">
                            {/* Chapter progress */}
                            <div>
                                <div className="flex items-center gap-3 text-sm text-gray-600">
                                    <span>Chapter</span>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        className="w-16 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center bg-white"
                                        value={chapterCurrent}
                                        onChange={(e) => {
                                            setChapterCurrent(e.target.value);
                                            if (chapterTotal && parseInt(e.target.value) >= parseInt(chapterTotal)) {
                                                setIsFinished(true);
                                            }
                                        }}
                                    />
                                    <span>of</span>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        className="w-16 p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-center bg-white"
                                        value={chapterTotal}
                                        onChange={(e) => setChapterTotal(e.target.value)}
                                    />
                                </div>
                                {chapterTotal && parseInt(chapterTotal) > 0 && (
                                    <div className="mt-2 flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${parseInt(chapterCurrent) >= parseInt(chapterTotal) ? 'bg-green-500' : 'bg-amber-500'}`}
                                                style={{ width: `${Math.min(100, ((parseInt(chapterCurrent) || 0) / parseInt(chapterTotal)) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                                            {!chapterCurrent || parseInt(chapterCurrent) === 0 ? 'Not started' : `${Math.round((parseInt(chapterCurrent) / parseInt(chapterTotal)) * 100)}%`}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Finished toggle */}
                            <button
                                type="button"
                                onClick={() => setIsFinished(!isFinished)}
                                className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                                    isFinished
                                        ? 'border-green-500 bg-green-50'
                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                            >
                                <span className="text-sm font-medium text-gray-700">We finished this book!</span>
                                <span className={`w-10 h-6 rounded-full relative transition-colors ${isFinished ? 'bg-green-500' : 'bg-gray-200'}`}>
                                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isFinished ? 'left-[18px]' : 'left-0.5'}`} />
                                </span>
                            </button>
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                        <input
                            type="date"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    <button type="submit" className="w-full bg-amber-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-amber-700 transition-all mb-2">
                        Log Reading
                    </button>
                    <button 
                        type="button" 
                        className="w-full bg-gray-200 text-gray-700 py-3.5 px-6 rounded-lg font-medium hover:bg-gray-300 transition-all"
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                </form>
            </div>
        </div>
    );
}

// Edit Goal Modal Component
function EditGoalModal({ child, onClose, onSave }) {
    const [minutesPerDay, setMinutesPerDay] = useState(child.goal?.minutesPerDay || 20);
    const [daysPerWeek, setDaysPerWeek] = useState(child.goal?.daysPerWeek || 5);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(parseInt(minutesPerDay), parseInt(daysPerWeek));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-3 text-gray-800">
                    Edit Reading Goal for {child.name}
                </h2>
                <p className="text-sm text-gray-600 mb-5">
                    Set a goal that fits your routine. You can change it anytime.
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Minutes per day</label>
                        <input
                            type="number"
                            value={minutesPerDay}
                            onChange={(e) => setMinutesPerDay(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            min="1"
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Days per week</label>
                        <input
                            type="number"
                            value={daysPerWeek}
                            onChange={(e) => setDaysPerWeek(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                            min="1"
                            max="7"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-3 bg-amber-600 text-white rounded-xl hover:bg-amber-700 font-medium"
                        >
                            Save Goal
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function OnboardingModal({ onComplete, onSkip }) {
    const [step, setStep] = useState(1);
    const [familyName, setFamilyName] = useState('');
    const [kids, setKids] = useState([{ name: '', ageGroup: 'early_reader', grade: '', favoriteGenres: [] }]);
    const [readingTime, setReadingTime] = useState('');
    const [library, setLibrary] = useState('');
    const [readingGoal, setReadingGoal] = useState('');

    const genres = [
        '📖 Picture Books', '🧚 Fantasy', '🦁 Animals', '🚀 Science Fiction',
        '🔍 Mystery', '📚 Chapter Books', '🎭 Humor', '⚽ Sports',
        '🦖 Non-Fiction', '🧪 Science', '🏰 Fairy Tales', '🎨 Art & Crafts'
    ];

    const readingStages = [
        { value: 'baby', label: '👶 Baby (0-1)' },
        { value: 'toddler', label: '🧸 Toddler (1-3)' },
        { value: 'early_reader', label: '📖 Early Reader (3-5)' },
        { value: 'independent', label: '📚 Independent (6-8)' },
        { value: 'student', label: '🎒 Student (9+)' },
        { value: 'homeschool', label: '🏠 Homeschool' }
    ];

    const addKid = () => {
        setKids([...kids, { name: '', ageGroup: 'early_reader', grade: '', favoriteGenres: [] }]);
    };

    const updateKid = (index, field, value) => {
        const newKids = [...kids];
        newKids[index][field] = value;
        setKids(newKids);
    };

    const toggleGenre = (index, genre) => {
        const newKids = [...kids];
        const g = newKids[index].favoriteGenres || [];
        if (g.includes(genre)) {
            newKids[index].favoriteGenres = g.filter(x => x !== genre);
        } else {
            newKids[index].favoriteGenres = [...g, genre];
        }
        setKids(newKids);
    };

    const removeKid = (index) => {
        if (kids.length > 1) {
            setKids(kids.filter((_, i) => i !== index));
        }
    };

    const handleComplete = () => {
        const profile = {
            familyName: familyName.trim() || 'My',
            readingTime,
            library: library.trim(),
            readingGoal,
            createdAt: new Date().toISOString()
        };
        
        const newChildren = kids
            .filter(k => k.name.trim())
            .map(k => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: k.name.trim(),
                childType: k.ageGroup,
                favoriteGenres: k.favoriteGenres || [],
                grade: k.grade || '',
                goal: { minutesPerDay: 20, daysPerWeek: 5, isCustom: false }
            }));
        
        onComplete(profile, newChildren);
    };

    const totalSteps = 5;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {/* Progress Bar */}
                <div className="flex gap-1 mb-6">
                    {[...Array(totalSteps)].map((_, i) => (
                        <div 
                            key={i} 
                            className={`flex-1 h-1.5 rounded-full ${i < step ? 'bg-amber-600' : 'bg-gray-200'}`}
                        />
                    ))}
                </div>

                {/* Step 1: Welcome */}
                {step === 1 && (
                    <div className="text-center">
                        <div className="text-5xl mb-4">📖</div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Your family's reading story</h2>
                        <p className="text-gray-500 mb-6">From first favorites to the books they outgrow — every story shared lives here.</p>
                        
                        <button 
                            onClick={() => setStep(2)}
                            className="w-full bg-amber-600 text-white py-3.5 rounded-lg font-semibold hover:bg-amber-700 transition-all mb-3"
                        >
                            Create our library
                        </button>
                        <button 
                            onClick={onSkip}
                            className="text-gray-400 text-sm hover:text-gray-600"
                        >
                            Maybe later
                        </button>
                    </div>
                )}

                {/* Step 2: Family Name */}
                {step === 2 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>What should we call your library?</h2>
                        <p className="text-sm text-gray-500 mb-5">This is just for you — make it personal.</p>
                        
                        <input 
                            type="text"
                            value={familyName}
                            onChange={(e) => setFamilyName(e.target.value)}
                            className="w-full p-3.5 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent mb-6"
                            placeholder="The Johnson Family Library"
                            autoFocus
                        />

                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600">Back</button>
                            <button onClick={() => setStep(3)} className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700">Next</button>
                        </div>
                    </div>
                )}

                {/* Step 3: Who reads with you */}
                {step === 3 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Who reads with you?</h2>
                        <p className="text-sm text-gray-500 mb-5">Add each reader in your family.</p>

                        {kids.map((kid, index) => (
                            <div key={index} className="mb-4 p-4 bg-gray-50 rounded-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm font-medium text-gray-600">Reader {index + 1}</span>
                                    {kids.length > 1 && (
                                        <button onClick={() => removeKid(index)} className="text-xs text-gray-400 hover:text-gray-600">Remove</button>
                                    )}
                                </div>
                                <input 
                                    type="text"
                                    value={kid.name}
                                    onChange={(e) => updateKid(index, 'name', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg mb-3 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                    placeholder="Reader's name"
                                    autoFocus={index === 0}
                                />
                                <select 
                                    value={kid.ageGroup}
                                    onChange={(e) => updateKid(index, 'ageGroup', e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-lg mb-2 text-sm"
                                >
                                    {readingStages.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                </select>
                                {(kid.ageGroup === 'student' || kid.ageGroup === 'homeschool') && (
                                    <input 
                                        type="text"
                                        value={kid.grade || ''}
                                        onChange={(e) => updateKid(index, 'grade', e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                                        placeholder="Grade (optional)"
                                    />
                                )}
                            </div>
                        ))}

                        <button onClick={addKid} className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-amber-400 mb-5">+ Add another reader</button>

                        <div className="flex gap-3">
                            <button onClick={() => setStep(2)} className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600">Back</button>
                            <button onClick={() => setStep(4)} className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700">Next</button>
                        </div>
                    </div>
                )}

                {/* Step 4: What stories do they love (optional) */}
                {step === 4 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>What kinds of stories do they love?</h2>
                        <p className="text-sm text-gray-500 mb-5">Pick a few — we'll suggest books. (Optional)</p>

                        {kids.filter(k => k.name.trim()).map((kid, index) => (
                            <div key={index} className="mb-4">
                                {kids.filter(k => k.name.trim()).length > 1 && (
                                    <div className="text-sm font-medium text-gray-700 mb-2">{kid.name}</div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {genres.map(genre => (
                                        <button 
                                            key={genre}
                                            onClick={() => toggleGenre(index, genre)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                (kid.favoriteGenres || []).includes(genre) 
                                                    ? 'bg-amber-100 text-amber-800 border-2 border-amber-300' 
                                                    : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                            }`}
                                        >
                                            {genre}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="flex gap-3 mt-5">
                            <button onClick={() => setStep(3)} className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600">Back</button>
                            <button onClick={() => setStep(5)} className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700">Next</button>
                        </div>
                    </div>
                )}

                {/* Step 5: Reading routine */}
                {step === 5 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>When do stories usually happen?</h2>
                        <p className="text-sm text-gray-500 mb-5">No pressure — just helps us personalize.</p>
                        
                        <div className="space-y-2 mb-6">
                            {['🌙 Bedtime', '☀️ Morning', '📚 After school', '🎲 Whenever we can'].map(time => (
                                <button
                                    key={time}
                                    onClick={() => setReadingTime(time)}
                                    className={`w-full p-3.5 rounded-xl text-left text-sm font-medium transition-all ${
                                        readingTime === time 
                                            ? 'bg-amber-100 text-amber-800 border-2 border-amber-300' 
                                            : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                    }`}
                                >
                                    {time}
                                </button>
                            ))}
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">What matters most right now?</label>
                            <div className="space-y-2">
                                {[
                                    { val: 'habit', label: '📅 Building a daily habit' },
                                    { val: 'bedtime', label: '🌙 Making bedtime special' },
                                    { val: 'independence', label: '📖 Growing independent readers' },
                                    { val: 'enjoy', label: '❤️ Just enjoying books together' }
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        onClick={() => setReadingGoal(opt.val)}
                                        className={`w-full p-3.5 rounded-xl text-left text-sm font-medium transition-all ${
                                            readingGoal === opt.val 
                                                ? 'bg-amber-100 text-amber-800 border-2 border-amber-300' 
                                                : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:border-gray-300'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setStep(4)} className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-600">Back</button>
                            <button 
                                onClick={handleComplete}
                                className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700"
                            >
                                Open our library
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Reading Room Tab
function ReadingRoomTab({ user, onSignIn }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user) { setLoading(false); return; }
        async function fetchProfile() {
            const { data } = await supabase
                .from('profiles')
                .select('username, display_name, room_is_public')
                .eq('id', user.id)
                .single();
            setProfile(data);
            setLoading(false);
        }
        fetchProfile();
    }, [user]);

    if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#8C7F72' }}>Loading...</div>;

    // Not logged in
    if (!user) {
        return (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📖</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 600, color: '#1C1712', marginBottom: 8 }}>
                    Your Reading Room
                </h2>
                <p style={{ color: '#4A4035', fontSize: '0.95rem', marginBottom: 8, lineHeight: 1.6 }}>
                    Create a beautiful public page to share your favorite children's books with the world.
                </p>
                <p style={{ color: '#8C7F72', fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.6 }}>
                    Curate themed shelves, add personal notes, and earn from affiliate links.
                </p>
                <button
                    onClick={onSignIn}
                    style={{
                        background: '#C4873A', color: 'white', border: 'none', borderRadius: 12,
                        padding: '14px 32px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif", width: '100%', maxWidth: 320,
                    }}
                >
                    Sign In to Get Started
                </button>
            </div>
        );
    }

    const hasRoom = profile?.username && profile?.room_is_public;

    // Has a room — link to it
    if (hasRoom) {
        return (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ fontSize: '3rem', marginBottom: 16 }}>📖</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 600, color: '#1C1712', marginBottom: 4 }}>
                    {profile.display_name || profile.username}'s Reading Room
                </h2>
                <p style={{ color: '#8C7F72', fontSize: '0.85rem', marginBottom: 24 }}>
                    ourbookmark.com/@{profile.username}
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <a
                        href={`/@${profile.username}`}
                        style={{
                            background: '#C4873A', color: 'white', border: 'none', borderRadius: 12,
                            padding: '14px 28px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif", textDecoration: 'none', display: 'inline-block',
                        }}
                    >
                        View & Edit Your Room
                    </a>
                    <button
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(`https://ourbookmark.com/@${profile.username}`);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            } catch {
                                // fallback
                                const text = `https://ourbookmark.com/@${profile.username}`;
                                const ta = document.createElement('textarea');
                                ta.value = text; document.body.appendChild(ta);
                                ta.select(); document.execCommand('copy');
                                document.body.removeChild(ta);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                            }
                        }}
                        style={{
                            background: copied ? '#6B8F71' : 'white',
                            color: copied ? 'white' : '#C4873A',
                            border: copied ? '1.5px solid #6B8F71' : '1.5px solid #C4873A',
                            borderRadius: 12,
                            padding: '14px 28px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                            fontFamily: "'DM Sans', sans-serif",
                            transition: 'all 0.2s',
                        }}
                    >
                        {copied ? '✓ Link Copied!' : 'Share Link'}
                    </button>
                </div>
            </div>
        );
    }

    // No room yet — promo
    return (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📖</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.5rem', fontWeight: 600, color: '#1C1712', marginBottom: 8 }}>
                Share Your Favorite Books
            </h2>
            <p style={{ color: '#4A4035', fontSize: '0.95rem', marginBottom: 8, lineHeight: 1.6 }}>
                Create a beautiful public page to share your favorite children's and YA book recommendations.
            </p>
            <p style={{ color: '#8C7F72', fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.6 }}>
                Curate themed shelves, add personal notes, and earn from affiliate links — all in a page that's uniquely yours.
            </p>
            <a
                href="/setup"
                style={{
                    display: 'inline-block', background: '#C4873A', color: 'white', border: 'none', borderRadius: 12,
                    padding: '14px 32px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", textDecoration: 'none', width: '100%', maxWidth: 320, boxSizing: 'border-box',
                }}
            >
                Create Your Reading Room
            </a>
        </div>
    );
}

// Settings Tab (inline version)
function SettingsTab({ 
    familyProfile, setFamilyProfile, children, logs, 
    onAddChild, onDeleteChild, onUpdateChild, onExport, onImport, 
    user, onSignOut, onSignIn, onShareCard, onGenerateReport, 
    onShowAbout, onShowFAQ 
}) {
    const [editingFamily, setEditingFamily] = useState(false);
    const [familyName, setFamilyName] = useState(familyProfile?.familyName || '');
    const [editingChild, setEditingChild] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    const activeChildren = children.filter(c => !c.archived);
    const archivedChildren = children.filter(c => c.archived);

    const getChildStats = (child) => {
        const childLogs = (logs || []).filter(l => l.childId === child.id);
        const titles = new Set(childLogs.map(l => (l.bookTitle || '').split(' by ')[0]));
        const totalBooks = titles.size;
        const totalMinutes = childLogs.reduce((sum, l) => sum + (l.minutes || 0), 0);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const bookCounts = {};
        childLogs.forEach(l => {
            const title = (l.bookTitle || '').split(' by ')[0];
            bookCounts[title] = (bookCounts[title] || 0) + 1;
        });
        const sorted = Object.entries(bookCounts).sort((a, b) => b[1] - a[1]);
        const fav = sorted[0] || null;
        return { totalBooks, totalMinutes, hours, mins, fav };
    };

    const getEmotionalLine = (child, stats) => {
        if (stats.totalBooks === 0) return 'Just getting started';
        if (stats.fav && stats.fav[1] >= 3) return 'In a reread phase';
        if (stats.totalBooks >= 10) return 'Loves storytime';
        if (stats.totalMinutes >= 300) return 'A devoted reader';
        return 'Building the habit';
    };

    return (
        <div style={{ fontFamily: "'DM Sans', sans-serif" }}>

            {/* ── NOT SIGNED IN: Show join screen ── */}
            {!user && (
                <div className="text-center py-12 px-4">
                    <div className="text-5xl mb-4">📚</div>
                    <h2 className="text-xl font-semibold text-gray-800 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                        Join OurBookmark
                    </h2>
                    <p className="text-sm text-gray-500 mb-1">
                        Track your family's reading, curate shelves,
                    </p>
                    <p className="text-sm text-gray-500 mb-6">
                        and share your favorites.
                    </p>
                    <button
                        onClick={onSignIn}
                        className="w-full max-w-xs mx-auto block px-6 py-3 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition-colors mb-3"
                    >
                        Sign Up / Sign In
                    </button>

                    <div className="mt-10 pt-6 border-t border-gray-100">
                        <div className="flex justify-center gap-6">
                            <button onClick={onShowAbout} className="text-sm text-amber-700 hover:text-amber-900 font-medium">About</button>
                            <button onClick={onShowFAQ} className="text-sm text-amber-700 hover:text-amber-900 font-medium">FAQ</button>
                        </div>
                        <p className="text-xs text-gray-300 mt-3">© 2026 OurBookmark</p>
                    </div>
                </div>
            )}

            {/* ── SIGNED IN: Full settings ── */}
            {user && (<>
            {/* Header */}
            <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-gray-800" style={{ fontFamily: "'Playfair Display', serif" }}>Home</h2>
                <p className="text-sm text-amber-700 font-medium">{familyProfile?.familyName ? `The ${familyProfile.familyName} Family Library` : 'Your Library'}</p>
                <p className="text-xs text-gray-400 mt-1">A place for your shared stories</p>
            </div>

            {/* FAMILY SPACE */}
            <div className="mb-8">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Family Space</div>
                {editingFamily ? (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Library name</label>
                        <input type="text" value={familyName} onChange={(e) => setFamilyName(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm mb-3" placeholder="The Johnson Family Library" />
                        <div className="flex gap-2">
                            <button onClick={() => { setFamilyProfile({ ...familyProfile, familyName: familyName.trim() }); setEditingFamily(false); }} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">Save</button>
                            <button onClick={() => setEditingFamily(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600">Cancel</button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="font-medium text-gray-800">📚 {familyProfile?.familyName ? `The ${familyProfile.familyName} Family Library` : 'Your Library'}</div>
                                <div className="text-xs text-gray-500 mt-1">What matters most: building the habit</div>
                                <div className="text-xs text-gray-500">Your reading routine: flexible</div>
                            </div>
                            <button onClick={() => setEditingFamily(true)} className="text-xs text-amber-700 font-medium">Edit</button>
                        </div>
                    </div>
                )}
            </div>

            {/* READERS */}
            <div className="mb-8">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Readers</div>
                <div className="space-y-3">
                    {activeChildren.map(child => {
                        const stats = getChildStats(child);
                        const emotionalLine = getEmotionalLine(child, stats);
                        return (
                            <div key={child.id} className="bg-white border border-gray-200 rounded-xl p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-medium text-gray-800">{child.name}</div>
                                        <div className="text-xs text-green-600">{emotionalLine}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {stats.totalBooks} book{stats.totalBooks !== 1 ? 's' : ''} · {stats.hours > 0 ? `${stats.hours}h ` : ''}{stats.mins}m reading
                                        </div>
                                        {stats.totalBooks === 0 && logs.length > 0 && (
                                            <div className="text-xs text-red-400 mt-1">
                                                ⚠️ {logs.length} logs exist but none match this reader.
                                                <button 
                                                    onClick={() => {
                                                        const logChildIds = [...new Set(logs.map(l => l.childId))];
                                                        const orphanedIds = logChildIds.filter(id => !children.find(c => c.id === id));
                                                        if (orphanedIds.length > 0 && confirm(`Found ${logs.filter(l => orphanedIds.includes(l.childId)).length} orphaned logs. Reassign them to ${child.name}?`)) {
                                                            const fixed = logs.map(l => 
                                                                orphanedIds.includes(l.childId) ? { ...l, childId: child.id } : l
                                                            );
                                                            // This triggers a re-render with fixed data
                                                            // We need to call the parent's setLogs — for now use localStorage directly
                                                            localStorage.setItem('mybookmark_logs', JSON.stringify(fixed));
                                                            window.location.reload();
                                                        } else {
                                                            alert(`Child ID: ${child.id}\nLog childIds: ${logChildIds.join(', ')}`);
                                                        }
                                                    }}
                                                    className="underline ml-1 text-amber-600"
                                                >
                                                    Fix it
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditingChild(child)} className="text-xs text-amber-700 font-medium">Edit</button>
                                        <button onClick={() => onDeleteChild(child.id)} className="text-xs text-gray-400 font-medium">Pause</button>
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => onShareCard(child)} className="flex-1 py-2 bg-pink-50 text-amber-700 rounded-lg text-xs font-medium">🎴 Share</button>
                                    <button onClick={() => onGenerateReport(child)} className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg text-xs font-medium">📄 Report</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {archivedChildren.length > 0 && (
                    <button onClick={() => setShowArchived(!showArchived)} className="text-xs text-gray-400 mt-3 block">
                        {showArchived ? 'Hide' : 'Show'} paused readers ({archivedChildren.length})
                    </button>
                )}
                {showArchived && archivedChildren.map(child => (
                    <div key={child.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-2 opacity-60">
                        <div className="flex justify-between items-center">
                            <div className="font-medium text-gray-600">{child.name} (paused)</div>
                            <button onClick={() => onUpdateChild({ ...child, archived: false })} className="text-xs text-amber-700 font-medium">Resume</button>
                        </div>
                    </div>
                ))}
                <button onClick={onAddChild} className="w-full mt-3 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-amber-400 hover:text-amber-700 transition-all">+ Add another reader</button>
            </div>

            {/* YOU */}
            <div className="mb-8">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">You</div>
                {user ? (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg">👤</div>
                            <div>
                                <div className="font-medium text-gray-800 text-sm">{user.email}</div>
                                <div className="text-xs text-green-600">Your library is safely saved</div>
                            </div>
                        </div>
                        <button onClick={onSignOut} className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all">Log Out</button>
                    </div>
                ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="text-sm text-gray-600 mb-3">Sign in to save your library across devices</p>
                        <button onClick={onSignIn} className="w-full py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Sign In / Sign Up</button>
                    </div>
                )}
            </div>

            {/* ABOUT & FAQ */}
            <div className="mb-4">
                <div className="flex justify-center gap-6 text-sm">
                    <button onClick={onShowAbout} className="text-amber-700 hover:text-amber-900 font-medium">About</button>
                    <button onClick={onShowFAQ} className="text-amber-700 hover:text-amber-900 font-medium">FAQ</button>
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center">© 2026 OurBookmark</p>
            </div>

            {editingChild && (
                <EditChildModal
                    child={editingChild}
                    onClose={() => setEditingChild(null)}
                    onSave={(updatedChild) => {
                        onUpdateChild(updatedChild);
                        setEditingChild(null);
                    }}
                />
            )}
            </>)}
        </div>
    );
}

// Home — A place for your family's reading life
function SettingsModal({ 
    familyProfile, 
    setFamilyProfile, 
    children,
    logs,
    onAddChild, 
    onDeleteChild,
    onUpdateChild,
    onExport, 
    onImport, 
    onClose,
    user,
    onSignOut,
    onSignIn,
    onShareCard,
    onGenerateReport
}) {
    const [editingFamily, setEditingFamily] = useState(false);
    const [familyName, setFamilyName] = useState(familyProfile?.familyName || '');
    const [editingChild, setEditingChild] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    const activeChildren = children.filter(c => !c.archived);
    const archivedChildren = children.filter(c => c.archived);

    const getChildStats = (child) => {
        const childLogs = (logs || []).filter(l => l.childId === child.id);
        const titles = new Set(childLogs.map(l => (l.bookTitle || '').split(' by ')[0]));
        const totalBooks = titles.size;
        const totalMinutes = childLogs.reduce((sum, l) => sum + (l.minutes || 0), 0);
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const bookCounts = {};
        childLogs.forEach(l => {
            const title = (l.bookTitle || '').split(' by ')[0];
            bookCounts[title] = (bookCounts[title] || 0) + 1;
        });
        const sorted = Object.entries(bookCounts).sort((a, b) => b[1] - a[1]);
        const fav = sorted[0] || null;
        return { totalBooks, totalMinutes, hours, mins, fav };
    };

    const getEmotionalLine = (child, stats) => {
        if (stats.totalBooks === 0) return 'Just getting started';
        if (stats.fav && stats.fav[1] >= 3) return 'In a reread phase';
        if (stats.totalBooks >= 10) return 'Loves storytime';
        if (stats.totalMinutes >= 300) return 'A devoted reader';
        return 'Building the habit';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="bg-gradient-to-b from-white to-gray-50 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {/* Header */}
                <div className="p-6 pb-4 border-b border-gray-100 relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg p-1">✕</button>
                    <div className="text-center">
                        <h2 className="text-lg font-semibold text-gray-800" style={{ fontFamily: "'Playfair Display', serif" }}>Home</h2>
                        <p className="text-sm text-amber-700 font-medium">{familyProfile?.familyName ? `The ${familyProfile.familyName} Family Library` : 'Your Library'}</p>
                        <p className="text-xs text-gray-400 mt-1">A place for your shared stories</p>
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-5">
                    {/* FAMILY SPACE */}
                    <div className="mb-8">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Family Space</div>
                        {editingFamily ? (
                            <div className="bg-white border border-gray-200 rounded-xl p-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Library name</label>
                                <input type="text" value={familyName} onChange={(e) => setFamilyName(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg text-sm mb-3" placeholder="The Johnson Family Library" />
                                <div className="flex gap-2">
                                    <button onClick={() => { setFamilyProfile({ ...familyProfile, familyName: familyName.trim() }); setEditingFamily(false); }} className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">Save</button>
                                    <button onClick={() => setEditingFamily(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-xl p-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="font-medium text-gray-800">📚 {familyProfile?.familyName ? `The ${familyProfile.familyName} Family Library` : 'Your Library'}</div>
                                        <div className="text-xs text-gray-500 mt-1">What matters most: building the habit</div>
                                        <div className="text-xs text-gray-500">Your reading routine: flexible</div>
                                    </div>
                                    <button onClick={() => setEditingFamily(true)} className="text-xs text-amber-700 font-medium">Edit</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* READERS */}
                    <div className="mb-8">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Readers</div>
                        <div className="space-y-3">
                            {activeChildren.map(child => {
                                const stats = getChildStats(child);
                                const emotionalLine = getEmotionalLine(child, stats);
                                return (
                                    <div key={child.id} className="bg-white border border-gray-200 rounded-xl p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="font-semibold text-gray-800 text-base">{child.name}</div>
                                                <div className="text-xs text-amber-700 font-medium">{emotionalLine}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                            <button onClick={() => setEditingChild(child)} className="text-xs text-amber-700 font-medium hover:text-amber-800">Edit</button>
                                            <button onClick={() => onDeleteChild(child.id)} className="text-xs text-gray-400 hover:text-gray-600">Pause</button>
                                        </div>
                                        </div>
                                        {stats.fav && (
                                            <div className="text-sm text-gray-600 mb-1">Favorite: {stats.fav[0]} ({stats.fav[1]}×)</div>
                                        )}
                                        <div className="text-xs text-gray-400">{stats.totalBooks} book{stats.totalBooks !== 1 ? 's' : ''} · {stats.hours > 0 ? `${stats.hours}h ` : ''}{stats.mins}m reading</div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => onShareCard && onShareCard(child)}
                                                disabled={!onShareCard}
                                                className="py-2 rounded-xl bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                📤 Share
                                            </button>
                                            <button
                                                onClick={() => onGenerateReport && onGenerateReport(child)}
                                                disabled={!onGenerateReport}
                                                className="py-2 rounded-xl bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                📄 Report
                                            </button>
                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={onAddChild} className="w-full mt-3 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-amber-400 hover:text-amber-700 transition-all">+ Add another reader</button>
                        
                        {archivedChildren.length > 0 && (
                            <div className="mt-4">
                                <button onClick={() => setShowArchived(!showArchived)} className="text-xs text-gray-400 font-medium">{showArchived ? '▼' : '▶'} {archivedChildren.length} paused reader{archivedChildren.length !== 1 ? 's' : ''}</button>
                                {showArchived && (
                                    <div className="mt-2 space-y-2">
                                        {archivedChildren.map(child => (
                                            <div key={child.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center opacity-70">
                                                <div>
                                                    <div className="font-medium text-gray-600 text-sm">{child.name}</div>
                                                    <div className="text-xs text-gray-400">Paused</div>
                                                </div>
                                                <button onClick={() => {
                                                    const updated = children.map(c => c.id === child.id ? { ...c, archived: false } : c);
                                                    onUpdateChild && onUpdateChild(child.id, { ...child, archived: false });
                                                }} className="text-xs text-amber-700 font-medium">Restore</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* YOU */}
                    <div className="mb-8">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">You</div>
                        {user ? (
                            <div className="bg-white border border-gray-200 rounded-xl p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg">👤</div>
                                    <div>
                                        <div className="font-medium text-gray-800 text-sm">{user.email}</div>
                                        <div className="text-xs text-green-600">Your library is safely saved</div>
                                    </div>
                                </div>
                                <button onClick={onSignOut} className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 transition-all">Log Out</button>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-xl p-4">
                                <p className="text-sm text-gray-600 mb-3">Sign in to save your library across devices</p>
                                {onSignIn ? (
                                    <button onClick={onSignIn} className="w-full py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">Sign In / Sign Up</button>
                                ) : (
                                    <p className="text-xs text-gray-400">Your data is saved locally on this device</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* READING ROOM */}
                    {user && (
                        <ReadingRoomSection userId={user.id} />
                    )}

            {editingChild && (
                <EditChildModal
                    child={editingChild}
                    onClose={() => setEditingChild(null)}
                    onSave={(updatedChild) => {
                        onUpdateChild(updatedChild);
                        setEditingChild(null);
                    }}
                />
            )}
                </div>
            </div>
        </div>
    );
}

// Reading Room Section for Settings
function ReadingRoomSection({ userId }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfile() {
            const { data } = await supabase
                .from('profiles')
                .select('username, display_name, room_is_public')
                .eq('id', userId)
                .single();
            setProfile(data);
            setLoading(false);
        }
        fetchProfile();
    }, [userId]);

    if (loading) return null;

    const hasRoom = profile?.username && profile?.room_is_public;

    return (
        <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Reading Room</div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                {hasRoom ? (
                    <>
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg">📖</div>
                            <div>
                                <div className="font-medium text-gray-800 text-sm">ourbookmark.com/@{profile.username}</div>
                                <div className="text-xs text-green-600">Your Reading Room is live!</div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <a href={`/@${profile.username}`} className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium text-center hover:bg-amber-700 transition-all">View Reading Room</a>
                            <a href="/setup" className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 text-center hover:bg-gray-50 transition-all">Edit Shelves</a>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-lg">📖</div>
                            <div>
                                <div className="font-medium text-gray-800 text-sm">Share Your Book Recommendations</div>
                                <div className="text-xs text-gray-500">Create a public page with your curated bookshelves</div>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Curate shelves, add personal notes, and earn from affiliate links — all in a beautiful page that's uniquely yours.</p>
                        <a href="/setup" className="block w-full py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium text-center hover:bg-amber-700 transition-all">Set Up Your Reading Room</a>
                    </>
                )}
            </div>
        </div>
    );
}

// Export/Import Modal Component
function ExportImportModal({ onClose, onExport, onImport }) {
    const [importing, setImporting] = useState(false);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const success = onImport(event.target.result);
            if (success) {
                setImporting(false);
            }
        };
        reader.onerror = () => {
            alert('Failed to read file. Please try again.');
            setImporting(false);
        };
        reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    📦 Library Backup
                </h2>

                {/* Export Section */}
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                    <h3 className="font-semibold text-blue-900 mb-2">📤 Save a copy of your library</h3>
                    <p className="text-sm text-blue-700 mb-3">
                        Download a file with your bookshelf and reading history. Keep it somewhere safe.
                    </p>
                    <button
                        onClick={onExport}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-all"
                    >
                        Download library copy
                    </button>
                </div>

                {/* Import Section */}
                <div className="mb-5 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                    <h3 className="font-semibold text-green-900 mb-2">📥 Restore your library</h3>
                    <p className="text-sm text-green-700 mb-3">
                        Upload a library copy to restore your bookshelf and history. This will replace what's currently here.
                    </p>
                    {!importing ? (
                        <button
                            onClick={() => setImporting(true)}
                            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-all"
                        >
                            Choose library file
                        </button>
                    ) : (
                        <div>
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleFileSelect}
                                className="w-full p-2 border border-green-300 rounded-lg text-sm"
                            />
                            <button
                                onClick={() => setImporting(false)}
                                className="w-full mt-2 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg text-sm hover:bg-gray-300 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>

                {/* Warning */}
                <div className="mb-5 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-800">
                        <strong>💡 Tip:</strong> Export your data regularly to prevent data loss. 
                        Your data is stored locally in your browser and will be lost if you clear browser data.
                    </p>
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-all"
                >
                    Close
                </button>
            </div>
        </div>
    );
}

// Share Card Modal - Generate shareable monthly reading card
function ShareCardModal({ child, logs, onClose, children, familyProfile }) {
    const cardRef = React.useRef(null);
    const [saving, setSaving] = useState(false);
    const [cardType, setCardType] = useState('child'); // 'child' or 'family'
    
    // Get current month data
    const now = new Date();
    const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Child stats
    const childLogs = logs.filter(l => 
        l.childId === child.id && new Date(l.date) >= monthStart
    );
    
    const totalMinutes = childLogs.reduce((sum, l) => sum + l.minutes, 0);
    const uniqueBooks = new Set(childLogs.map(l => l.bookTitle)).size;
    const daysRead = new Set(childLogs.map(l => l.date)).size;
    
    // Count re-reads
    const bookCounts = {};
    childLogs.forEach(l => {
        bookCounts[l.bookTitle] = (bookCounts[l.bookTitle] || 0) + 1;
    });
    const reReads = Object.values(bookCounts).filter(c => c > 1).length;
    
    // Get book covers (up to 4)
    const booksWithCovers = [];
    const seenTitles = new Set();
    for (const log of childLogs) {
        if (log.coverUrl && !seenTitles.has(log.bookTitle)) {
            booksWithCovers.push({ title: log.bookTitle, coverUrl: log.coverUrl });
            seenTitles.add(log.bookTitle);
            if (booksWithCovers.length >= 4) break;
        }
    }
    
    // Family stats (for family card)
    const familyLogs = logs.filter(l => new Date(l.date) >= monthStart);
    const familyMinutes = familyLogs.reduce((sum, l) => sum + l.minutes, 0);
    const familyBooks = new Set(familyLogs.map(l => l.bookTitle)).size;
    const familyDays = new Set(familyLogs.map(l => l.date)).size;
    
    // Find top reader
    const readerMinutes = {};
    familyLogs.forEach(l => {
        readerMinutes[l.childId] = (readerMinutes[l.childId] || 0) + l.minutes;
    });
    const topReaderId = Object.entries(readerMinutes).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topReader = children?.find(c => c.id === topReaderId);
    
    // Family re-reads
    const familyBookCounts = {};
    familyLogs.forEach(l => {
        familyBookCounts[l.bookTitle] = (familyBookCounts[l.bookTitle] || 0) + 1;
    });
    const familyReReads = Object.values(familyBookCounts).filter(c => c > 1).length;
    
    // Most read book
    const mostReadBook = Object.entries(familyBookCounts).sort((a, b) => b[1] - a[1])[0];
    
    const saveCard = async () => {
        if (!cardRef.current) return;
        
        setSaving(true);
        try {
            if (window.html2canvas) {
                const canvas = await window.html2canvas(cardRef.current, {
                    backgroundColor: '#ffffff',
                    scale: 2
                });
                const link = document.createElement('a');
                const filename = cardType === 'family' 
                    ? `family-reading-${monthName.replace(' ', '-')}.png`
                    : `${child.name}-reading-${monthName.replace(' ', '-')}.png`;
                link.download = filename;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } else {
                alert('Take a screenshot to save this card!');
            }
        } catch (err) {
            alert('Take a screenshot to save this card!');
        }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Share Reading Card</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>
                
                {/* Card Type Toggle */}
                {children && children.length > 0 && (
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setCardType('child')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                cardType === 'child' 
                                    ? 'bg-amber-600 text-white' 
                                    : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                            👤 {child.name}
                        </button>
                        <button
                            onClick={() => setCardType('family')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                cardType === 'family' 
                                    ? 'bg-amber-600 text-white' 
                                    : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                            👨‍👩‍👧‍👦 Family
                        </button>
                    </div>
                )}
                
                {/* Child Card */}
                {cardType === 'child' && (
                    <div 
                        ref={cardRef}
                        className="bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 rounded-2xl p-5 text-white mb-4 shadow-xl"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                        <div className="text-center mb-4">
                            <div className="text-2xl mb-1">🔖</div>
                            <div className="text-xs opacity-75 uppercase tracking-wider">OurBookmark</div>
                        </div>
                        
                        <div className="text-center mb-4">
                            <div className="text-xl font-bold">⭐ {child.name}'s {monthName} ⭐</div>
                        </div>
                        
                        <div className="bg-white bg-opacity-15 rounded-xl p-4 mb-4">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <div className="text-2xl font-bold">{uniqueBooks}</div>
                                    <div className="text-xs opacity-75">📚 Books</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold">{totalMinutes}</div>
                                    <div className="text-xs opacity-75">⏱️ Minutes</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold">{daysRead}</div>
                                    <div className="text-xs opacity-75">📅 Days</div>
                                </div>
                            </div>
                            {reReads > 0 && (
                                <div className="text-center mt-3 pt-3 border-t border-white border-opacity-20">
                                    <span className="text-yellow-300 text-sm font-medium">↻ {reReads} favorite{reReads > 1 ? 's' : ''} re-read!</span>
                                </div>
                            )}
                        </div>
                        
                        {booksWithCovers.length > 0 && (
                            <div className="flex justify-center gap-2 mb-4">
                                {booksWithCovers.map((book, idx) => (
                                    <img 
                                        key={idx}
                                        src={book.coverUrl} 
                                        alt={book.title}
                                        className="w-12 h-16 object-contain bg-white rounded shadow-lg"
                                        onError={(e) => e.target.style.display = 'none'}
                                    />
                                ))}
                            </div>
                        )}
                        
                        <div className="text-center">
                            <div className="text-xs opacity-75 italic">"Building readers, one page at a time"</div>
                        </div>
                    </div>
                )}
                
                {/* Family Card */}
                {cardType === 'family' && (
                    <div 
                        ref={cardRef}
                        className="bg-gradient-to-br from-indigo-600 via-amber-600 to-amber-600 rounded-2xl p-5 text-white mb-4 shadow-xl"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                        <div className="text-center mb-4">
                            <div className="text-2xl mb-1">🔖</div>
                            <div className="text-xs opacity-75 uppercase tracking-wider">OurBookmark</div>
                        </div>
                        
                        <div className="text-center mb-4">
                            <div className="text-xl font-bold">
                                📚 The {familyProfile?.familyName || 'Our'} Family
                            </div>
                            <div className="text-sm opacity-90">{monthName}</div>
                        </div>
                        
                        <div className="bg-white bg-opacity-15 rounded-xl p-4 mb-4">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <div className="text-2xl font-bold">{familyBooks}</div>
                                    <div className="text-xs opacity-75">📚 Books</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold">{familyMinutes}</div>
                                    <div className="text-xs opacity-75">⏱️ Minutes</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold">{familyDays}</div>
                                    <div className="text-xs opacity-75">📅 Days</div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="space-y-2 mb-4">
                            {topReader && (
                                <div className="bg-white bg-opacity-10 rounded-lg p-2 text-center">
                                    <span className="text-yellow-300">🏆</span> Top Reader: <span className="font-bold">{topReader.name}</span>
                                </div>
                            )}
                            {mostReadBook && mostReadBook[1] > 1 && (
                                <div className="bg-white bg-opacity-10 rounded-lg p-2 text-center text-sm">
                                    <span className="text-pink-300">❤️</span> Most loved: {mostReadBook[0].split(' by ')[0].substring(0, 20)}{mostReadBook[0].length > 20 ? '...' : ''} <span className="text-yellow-300">(↻{mostReadBook[1]})</span>
                                </div>
                            )}
                            {familyReReads > 0 && (
                                <div className="text-center text-sm">
                                    <span className="text-yellow-300">↻ {familyReReads} book{familyReReads > 1 ? 's' : ''} re-read this month!</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="text-center">
                            <div className="text-xs opacity-75 italic">"A family that reads together..."</div>
                        </div>
                    </div>
                )}
                
                {/* Actions */}
                <div className="space-y-2">
                    <button
                        onClick={saveCard}
                        disabled={saving}
                        className="w-full bg-amber-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-amber-700 transition-all disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : '📸 Screenshot to Save & Share'}
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                        Take a screenshot of the card above to share on social media!
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
// ─────────────────────────────────────────────────────────────
// Router wrapper
// Public Reading Rooms live at: /@username  (e.g. /@shirlz)
// Everything else stays the same under /*
// NOTE: Your src/main.jsx must wrap <App/> with <BrowserRouter>.
// ─────────────────────────────────────────────────────────────
export default function App(props) {
  return (
    <Routes>
      <Route path="/setup" element={<ReadingRoomSetup />} />
      <Route path="/reading-room-faq" element={<ReadingRoomFAQ />} />
      <Route path="/:username" element={<PublicReadingRoom />} />
      <Route path="/*" element={<MainApp {...props} />} />
    </Routes>
  );
}
