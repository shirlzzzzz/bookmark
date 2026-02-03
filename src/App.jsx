// MyBookmark App
import React, { useState, useEffect } from 'react';

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

// Fetch book cover from Open Library API
const fetchBookCover = async (bookTitle) => {
    try {
        // Clean up the title - remove "by Author" if present
        const cleanTitle = bookTitle.split(' by ')[0].trim();
        const searchQuery = encodeURIComponent(cleanTitle);
        
        const response = await fetch(`https://openlibrary.org/search.json?title=${searchQuery}&limit=1`);
        const data = await response.json();
        
        if (data.docs && data.docs.length > 0) {
            const book = data.docs[0];
            if (book.cover_i) {
                return `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`;
            }
        }
        return null;
    } catch (error) {
        console.error('Error fetching book cover:', error);
        return null;
    }
};

// Main App Component
export default function App() {
    // Smart default view: Log tab if setup complete, otherwise show onboarding
    const [currentView, setCurrentView] = useState('log');
    const [children, setChildren] = useState([]);
    const [logs, setLogs] = useState([]);
    const [challenges, setChallenges] = useState([]); // Keep for read-a-thons
    const [syncs, setSyncs] = useState([]); // Goals (keeping internal name)
    const [classGroups, setClassGroups] = useState([]);
    const [familyProfile, setFamilyProfile] = useState(null);
    const [showAddChild, setShowAddChild] = useState(false);
    const [showAddLog, setShowAddLog] = useState(false);
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
    const [showOnboarding, setShowOnboarding] = useState(() => {
        return !localStorage.getItem('mybookmark_onboarded');
    });
    const [showShareCard, setShowShareCard] = useState(false);
    const [shareCardChild, setShareCardChild] = useState(null);
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

    const addChild = (name, grade, childType) => {
        // Validation
        if (!name || name.trim().length === 0) {
            setError('Child name is required');
            return false;
        }
        
        if (name.trim().length > 50) {
            setError('Child name is too long (max 50 characters)');
            return false;
        }

        const recommendation = getRecommendation(grade);
        const newChild = {
            id: Date.now().toString(),
            name: name.trim(),
            grade: grade ? grade.trim() : '',
            childType: childType || 'student',
            goal: {
                minutesPerDay: recommendation.minutes,
                daysPerWeek: recommendation.daysPerWeek,
                isCustom: false
            },
            milestones: []
        };
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

    const deleteChild = (id) => {
        if (confirm('Delete this child? Their reading logs will remain but won\'t show in summaries.')) {
            setChildren(children.filter(c => c.id !== id));
        }
    };

    const addLog = (childId, bookTitle, minutes, date, subject, genre, coverUrl) => {
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
            coverUrl: coverUrl || null
        };
        setLogs([newLog, ...logs]);
        setShowAddLog(false);
        setError(null);
        return true;
    };

    const deleteLog = (id) => {
        if (confirm('Delete this reading log entry?')) {
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
        if (confirm('Delete this reading goal?')) {
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
            link.download = `mybookmark-backup-${new Date().toISOString().split('T')[0]}.json`;
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
            setError('Failed to import data. Please make sure you selected a valid MyBookmark backup file.');
            return false;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            <div className="max-w-2xl mx-auto bg-white min-h-screen shadow-xl">
                {/* Header */}
                <div className="bg-gradient-to-br from-purple-600 to-purple-800 text-white p-6 text-center">
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex-1"></div>
                        <h1 className="text-2xl font-semibold flex-1">
                            🔖 {familyProfile?.familyName ? `The ${familyProfile.familyName} Family` : 'My'} Bookmark
                        </h1>
                        <div className="flex-1 flex justify-end">
                            <button
                                onClick={() => setShowSettings(true)}
                                className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-all text-sm"
                                title="Settings"
                            >
                                ⚙️
                            </button>
                        </div>
                    </div>
                    <p className="text-sm opacity-90 mb-2">From first board books to chapter books and beyond, My Bookmark helps families track reading and bookmark the moments that matter.</p>
                    <p className="text-xs opacity-75">Log reading in seconds, track progress for every child from the very first book through middle school, and generate school-ready reports when you need them.</p>
                </div>

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

                {/* Navigation */}
                <div className="flex bg-white border-b-2 border-gray-200 sticky top-0 z-10">
                    <button 
                        className={`flex-1 py-4 text-sm font-medium transition-all ${
                            currentView === 'log' 
                                ? 'text-purple-600 border-b-4 border-purple-600' 
                                : 'text-gray-500 border-b-4 border-transparent'
                        }`}
                        onClick={() => setCurrentView('log')}
                    >
                        Log
                    </button>
                    <button 
                        className={`flex-1 py-4 text-sm font-medium transition-all ${
                            currentView === 'goals' 
                                ? 'text-purple-600 border-b-4 border-purple-600' 
                                : 'text-gray-500 border-b-4 border-transparent'
                        }`}
                        onClick={() => setCurrentView('goals')}
                    >
                        Goals
                    </button>
                    <button 
                        className={`flex-1 py-4 text-sm font-medium transition-all ${
                            currentView === 'progress' 
                                ? 'text-purple-600 border-b-4 border-purple-600' 
                                : 'text-gray-500 border-b-4 border-transparent'
                        }`}
                        onClick={() => setCurrentView('progress')}
                    >
                        Progress
                    </button>
                    <button 
                        className={`flex-1 py-4 text-sm font-medium transition-all ${
                            currentView === 'bookshelf' 
                                ? 'text-purple-600 border-b-4 border-purple-600' 
                                : 'text-gray-500 border-b-4 border-transparent'
                        }`}
                        onClick={() => setCurrentView('bookshelf')}
                    >
                        📚
                    </button>
                </div>

                {/* Content */}
                <div className="p-5">
                    {currentView === 'log' && (
                        <LogView 
                            children={children}
                            logs={logs}
                            onAddLog={() => setShowAddLog(true)}
                            onDeleteLog={deleteLog}
                        />
                    )}
                    {currentView === 'goals' && (
                        <GoalsView 
                            children={children}
                            goals={syncs}
                            logs={logs}
                            challenges={challenges}
                            onCreateGoal={() => setShowCreateSync(true)}
                            onCompleteGoal={completeSync}
                            onDeleteGoal={deleteSync}
                        />
                    )}
                    {currentView === 'progress' && (
                        <ProgressView 
                            children={children}
                            logs={logs}
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
                            selectedChild={selectedChild}
                            onSelectChild={setSelectedChild}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 py-6 px-5 text-center bg-gray-50">
                    <div className="flex justify-center gap-6 text-sm">
                        <button 
                            onClick={() => setShowAbout(true)}
                            className="text-purple-600 hover:text-purple-800 font-medium"
                        >
                            About
                        </button>
                        <button 
                            onClick={() => setShowFAQ(true)}
                            className="text-purple-600 hover:text-purple-800 font-medium"
                        >
                            FAQ
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-3">© 2025 My Bookmark</p>
                </div>

                {/* Modals */}
                {showAddChild && (
                    <AddChildModal 
                        onClose={() => setShowAddChild(false)}
                        onAdd={addChild}
                    />
                )}

                {showAddLog && (
                    <AddLogModal 
                        children={children}
                        logs={logs}
                        onClose={() => setShowAddLog(false)}
                        onAdd={addLog}
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

                {/* Settings Modal */}
                {showSettings && (
                    <SettingsModal
                        familyProfile={familyProfile}
                        setFamilyProfile={(profile) => {
                            setFamilyProfile(profile);
                            setStorageData('mybookmark_family', profile);
                        }}
                        children={children}
                        onAddChild={() => setShowAddChild(true)}
                        onDeleteChild={deleteChild}
                        classGroups={classGroups}
                        onJoinClass={() => setShowJoinClass(true)}
                        onCreateClass={() => setShowCreateClass(true)}
                        onLeaveClass={leaveClassGroup}
                        onExport={exportData}
                        onImport={importData}
                        onClose={() => setShowSettings(false)}
                    />
                )}

                {/* About Modal */}
                {showAbout && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={() => setShowAbout(false)}>
                        <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-semibold text-gray-800">About My Bookmark</h2>
                                <button onClick={() => setShowAbout(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                            </div>
                            
                            {/* How It Works */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-purple-700 mb-4">📚 How It Works (3 Steps)</h3>
                                
                                <div className="space-y-4">
                                    <div className="bg-purple-50 p-4 rounded-lg">
                                        <h4 className="font-semibold text-purple-800 mb-1">1. Log Reading Easily</h4>
                                        <p className="text-sm text-gray-600">Log read-aloud or independent reading in seconds. Track minutes, books, and chapter completion—all in one place.</p>
                                    </div>
                                    
                                    <div className="bg-purple-50 p-4 rounded-lg">
                                        <h4 className="font-semibold text-purple-800 mb-1">2. Watch Reading Grow</h4>
                                        <p className="text-sm text-gray-600">See gentle progress dashboards for each child. Build a reading habit without pressure or comparison.</p>
                                    </div>
                                    
                                    <div className="bg-purple-50 p-4 rounded-lg">
                                        <h4 className="font-semibold text-purple-800 mb-1">3. Share When Needed</h4>
                                        <p className="text-sm text-gray-600">Export clean, school-ready reports for teachers, homeschool records, or reading programs—no re-logging required.</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Who It's For */}
                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-purple-700 mb-3">👨‍👩‍👧‍👦 Who It's For</h3>
                                <p className="text-gray-600 mb-3">Built for families first. My Bookmark works whether your child is:</p>
                                <ul className="text-sm text-gray-600 space-y-2 ml-4">
                                    <li>• A baby listening to their first books</li>
                                    <li>• A preschooler enjoying read-alouds</li>
                                    <li>• A K–8 student reading independently</li>
                                    <li>• Homeschooled, in school, or somewhere in between</li>
                                </ul>
                                <p className="text-sm text-gray-500 mt-3 italic">Teachers and schools can use My Bookmark too—but families never need school adoption to get value.</p>
                            </div>
                            
                            {/* Key Features */}
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-purple-700 mb-3">✨ Key Features</h3>
                                <ul className="text-sm text-gray-600 space-y-2 ml-4">
                                    <li>• Unlimited children per family</li>
                                    <li>• Read-aloud + independent reading tracking</li>
                                    <li>• Minutes + book completion tracking</li>
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
                )}

                {/* FAQ Modal */}
                {showFAQ && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={() => setShowFAQ(false)}>
                        <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-semibold text-gray-800">Frequently Asked Questions</h2>
                                <button onClick={() => setShowFAQ(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                            </div>
                            
                            <div className="space-y-6">
                                {/* General */}
                                <div>
                                    <h3 className="text-lg font-semibold text-purple-700 mb-3">General</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">What is My Bookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">My Bookmark is a parent-focused reading tracker that helps families log reading, track progress across multiple children, and generate school-ready reports. It works from the very first read-aloud through independent reading and beyond.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Who is My Bookmark for?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Parents of babies, toddlers, and school-age kids. Families with multiple children. Homeschool families and co-ops. Parents participating in school reading programs. Teachers and schools can use it too, but families never need school adoption to get value.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Do I need a school or teacher to use My Bookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">No. My Bookmark is fully usable on its own by families. Teachers, classrooms, or schools can optionally participate for challenges or reporting, but it's never required.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Reading & Tracking */}
                                <div>
                                    <h3 className="text-lg font-semibold text-purple-700 mb-3">Reading & Tracking</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">What kinds of reading can I track?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Read-alouds (perfect for babies and toddlers), shared reading, independent reading, chapter books, and rereading favorite books. Every kind of reading counts.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Do you track minutes or books?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Both. Parents can log reading minutes, book titles, and book completion (especially helpful for chapter books). This gives you a complete picture of reading habits.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can I track multiple children?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. My Bookmark supports unlimited children per household, always. There are no per-child fees.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can kids log reading themselves?</h4>
                                            <p className="text-sm text-gray-600 mt-1">My Bookmark is parent-controlled by design. Older children can participate with supervision, but parents always manage the account, data, and sharing.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Reports & School Programs */}
                                <div>
                                    <h3 className="text-lg font-semibold text-purple-700 mb-3">Reports & School Programs</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can I generate reports for school or homeschool records?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. My Bookmark generates clean, school-ready PDF and CSV reports for teachers, homeschool documentation, reading challenges, and read-a-thons.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Teachers & Groups */}
                                <div>
                                    <h3 className="text-lg font-semibold text-purple-700 mb-3">Teachers, Classrooms & Groups</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can teachers use My Bookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. Teachers can create optional class groups, track participation, and run reading challenges. Families can join classes if they choose, but don't need a teacher to use My Bookmark.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Can PTAs, co-ops, or schools use My Bookmark?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. My Bookmark can be used for classroom challenges, school-wide read-a-thons, homeschool co-ops, and community reading programs.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Privacy & Data */}
                                <div>
                                    <h3 className="text-lg font-semibold text-purple-700 mb-3">Privacy & Data</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">Is My Bookmark privacy-friendly?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Yes. Privacy is core to how My Bookmark is built. No ads, no selling personal data, parents control what is shared, and children never create independent accounts.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">Do you collect personal data about children?</h4>
                                            <p className="text-sm text-gray-600 mt-1">My Bookmark collects only what's necessary to provide the service, such as reading activity entered by parents. We do not sell data or use it for advertising. Parents remain in control at all times.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Getting Started */}
                                <div>
                                    <h3 className="text-lg font-semibold text-purple-700 mb-3">Getting Started</h3>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="font-medium text-gray-800">How long does it take to set up?</h4>
                                            <p className="text-sm text-gray-600 mt-1">Most families are up and running in under 2 minutes.</p>
                                        </div>
                                        
                                        <div>
                                            <h4 className="font-medium text-gray-800">What devices does My Bookmark work on?</h4>
                                            <p className="text-sm text-gray-600 mt-1">My Bookmark is a web app that works on phones, tablets, and computers. No download required.</p>
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
                )}
            </div>
        </div>
    );
}

// Log View Component
function LogView({ children, logs, onAddLog, onDeleteLog }) {
    if (children.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <div className="text-6xl mb-4">👶</div>
                <h3 className="text-lg text-gray-600 mb-2">Add your first child</h3>
                <p className="text-sm">Go to the Kids tab to get started</p>
            </div>
        );
    }

    const recentLogs = logs.slice(0, 20);

    return (
        <div>
            <button 
                className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all"
                onClick={onAddLog}
            >
                ➕ Log Reading Session
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
                            <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-3 border-l-4 border-l-purple-600 hover:shadow-md transition-shadow">
                                <div className="flex gap-3">
                                    {/* Book Cover */}
                                    {log.coverUrl ? (
                                        <img 
                                            src={log.coverUrl} 
                                            alt="Book cover" 
                                            className="w-14 h-20 object-cover rounded shadow-sm flex-shrink-0"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-14 h-20 bg-gradient-to-br from-purple-100 to-purple-200 rounded flex items-center justify-center flex-shrink-0">
                                            <span className="text-2xl">📖</span>
                                        </div>
                                    )}
                                    
                                    {/* Log Details */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <div>
                                                <div className="font-semibold text-gray-800">{child?.name || 'Unknown'}</div>
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
                                        <span className="inline-block px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                                            {log.minutes} minutes
                                        </span>
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

// Progress View Component
function ProgressView({ children, logs, selectedChild, onSelectChild, updateChildGoal, onGenerateReport, onShareCard }) {
    const [showEditGoal, setShowEditGoal] = useState(false);

    if (children.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <div className="text-6xl mb-4">👶</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a child first</h3>
                <p className="text-sm">Go to the Kids tab to get started</p>
            </div>
        );
    }

    const childId = selectedChild || children[0]?.id;
    const child = children.find(c => c.id === childId);
    const childLogs = logs.filter(l => l.childId === childId);

    // Calculate stats
    const weekStart = getWeekStart();
    const weekLogs = childLogs.filter(l => new Date(l.date) >= weekStart);
    const weekMinutes = weekLogs.reduce((sum, l) => sum + l.minutes, 0);
    const daysReadThisWeek = new Set(weekLogs.map(l => l.date)).size;

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthLogs = childLogs.filter(l => new Date(l.date) >= monthStart);
    const monthMinutes = monthLogs.reduce((sum, l) => sum + l.minutes, 0);

    const totalBooks = new Set(childLogs.map(l => l.bookTitle)).size;
    const totalMinutes = childLogs.reduce((sum, l) => sum + l.minutes, 0);

    // Goal tracking
    const goal = child?.goal || { minutesPerDay: 20, daysPerWeek: 5 };
    const weeklyGoalMinutes = goal.minutesPerDay * goal.daysPerWeek;
    const goalProgress = Math.min(100, Math.round((weekMinutes / weeklyGoalMinutes) * 100));
    const isOnTrack = weekMinutes >= weeklyGoalMinutes;
    const minutesNeeded = Math.max(0, weeklyGoalMinutes - weekMinutes);
    const daysNeeded = Math.max(0, goal.daysPerWeek - daysReadThisWeek);

    return (
        <div>
            {children.length > 1 && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Child</label>
                    <select 
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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

            {/* Weekly Goal Progress */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 rounded-xl p-4 mb-5">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="text-sm font-semibold text-purple-900 mb-1">
                            📖 Weekly Reading Goal
                        </div>
                        <div className="text-xs text-purple-700">
                            {goal.minutesPerDay} min/day • {goal.daysPerWeek} days/week
                            {!goal.isCustom && child?.grade && (
                                <span className="ml-1">(Recommended for {child.grade})</span>
                            )}
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowEditGoal(true)}
                        className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                    >
                        Edit Goal
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                    <div className="flex justify-between text-xs text-purple-700 mb-1">
                        <span>{weekMinutes} of {weeklyGoalMinutes} minutes</span>
                        <span className="font-semibold">{goalProgress}%</span>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-3 overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-500 rounded-full ${
                                isOnTrack ? 'bg-green-500' : 'bg-purple-600'
                            }`}
                            style={{ width: `${goalProgress}%` }}
                        />
                    </div>
                </div>

                {/* Status Message */}
                {isOnTrack ? (
                    <div className="text-sm font-medium text-green-700 flex items-center gap-2">
                        <span>🎉</span>
                        <span>Goal achieved! Keep up the great work!</span>
                    </div>
                ) : (
                    <div className="text-sm text-purple-800">
                        {daysNeeded > 0 ? (
                            <span>Read {daysNeeded} more day{daysNeeded !== 1 ? 's' : ''} this week</span>
                        ) : minutesNeeded > 0 ? (
                            <span>{minutesNeeded} more minutes needed</span>
                        ) : (
                            <span>Keep going!</span>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-1">{daysReadThisWeek}</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Days This Week</div>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-1">{monthMinutes}</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Minutes This Month</div>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-1">{totalBooks}</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Unique Books</div>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-1">{totalMinutes}</div>
                    <div className="text-xs text-gray-600 uppercase tracking-wide">Total Minutes</div>
                </div>
            </div>

            {childLogs.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">📖</div>
                    <h3 className="text-lg text-gray-600 mb-2">No reading logged yet</h3>
                    <p className="text-sm">Go to Log Reading to add sessions</p>
                </div>
            ) : (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold">Reading History</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onShareCard(child)}
                                className="px-3 py-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-200 transition-all"
                            >
                                📤 Share
                            </button>
                            <button
                                onClick={() => onGenerateReport(child)}
                                className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-all"
                            >
                                📄 Report
                            </button>
                        </div>
                    </div>
                    {childLogs.slice(0, 10).map(log => (
                        <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-3 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start">
                                <div className="font-medium text-gray-800">{log.bookTitle}</div>
                                <span className="inline-block px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                                    {log.minutes}m
                                </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1">{formatDate(log.date)}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Goal Modal */}
            {showEditGoal && (
                <EditGoalModal
                    child={child}
                    onClose={() => setShowEditGoal(false)}
                    onSave={(newGoal) => {
                        updateChildGoal(child.id, newGoal);
                        setShowEditGoal(false);
                    }}
                />
            )}
        </div>
    );
}

// Bookshelf View Component - Visual grid of all books read
function BookshelfView({ children, logs, selectedChild, onSelectChild }) {
    if (children.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <div className="text-6xl mb-4">📚</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a child first</h3>
                <p className="text-sm">Go to the Kids tab to get started</p>
            </div>
        );
    }

    const childId = selectedChild || children[0]?.id;
    const child = children.find(c => c.id === childId);
    const childLogs = logs.filter(l => l.childId === childId);
    
    // Get unique books with their covers
    const booksMap = new Map();
    childLogs.forEach(log => {
        if (!booksMap.has(log.bookTitle)) {
            booksMap.set(log.bookTitle, {
                title: log.bookTitle,
                coverUrl: log.coverUrl,
                totalMinutes: log.minutes,
                timesRead: 1,
                lastRead: log.date
            });
        } else {
            const book = booksMap.get(log.bookTitle);
            book.totalMinutes += log.minutes;
            book.timesRead += 1;
            if (new Date(log.date) > new Date(book.lastRead)) {
                book.lastRead = log.date;
            }
        }
    });
    
    const books = Array.from(booksMap.values()).sort((a, b) => 
        new Date(b.lastRead) - new Date(a.lastRead)
    );

    return (
        <div>
            {children.length > 1 && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Child</label>
                    <select 
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        value={childId}
                        onChange={(e) => onSelectChild(e.target.value)}
                    >
                        {children.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">{child?.name}'s Bookshelf</h2>
                <span className="text-sm text-gray-500">{books.length} books</span>
            </div>

            {books.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">📚</div>
                    <h3 className="text-lg text-gray-600 mb-2">No books yet</h3>
                    <p className="text-sm">Start logging reading to build your bookshelf!</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    {books.map((book, idx) => (
                        <div key={idx} className="relative group">
                            {book.coverUrl ? (
                                <img 
                                    src={book.coverUrl} 
                                    alt={book.title}
                                    className="w-full h-32 object-cover rounded-lg shadow-md hover:shadow-xl transition-shadow"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                    }}
                                />
                            ) : null}
                            <div 
                                className={`w-full h-32 bg-gradient-to-br from-purple-400 to-purple-600 rounded-lg shadow-md flex items-center justify-center p-2 ${book.coverUrl ? 'hidden' : 'flex'}`}
                            >
                                <span className="text-white text-xs text-center font-medium leading-tight line-clamp-3">
                                    {book.title.split(' by ')[0]}
                                </span>
                            </div>
                            
                            {/* Re-read badge */}
                            {book.timesRead > 1 && (
                                <div className="absolute top-1 right-1 bg-purple-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full shadow-md">
                                    ↻ {book.timesRead}
                                </div>
                            )}
                            
                            {/* Hover overlay with details */}
                            <div className="absolute inset-0 bg-black bg-opacity-75 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                                <span className="text-white text-xs text-center font-medium mb-1 line-clamp-2">{book.title.split(' by ')[0]}</span>
                                <span className="text-purple-300 text-xs">{book.totalMinutes} min</span>
                                {book.timesRead > 1 && (
                                    <span className="text-yellow-300 text-xs font-medium">↻ Read {book.timesRead}x</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Kids View Component
function KidsView({ children, onAddChild, onDeleteChild, classGroups, onJoinClass, onCreateClass, onLeaveClass }) {
    return (
        <div>
            <button 
                className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all mb-3"
                onClick={onAddChild}
            >
                ➕ Add Child
            </button>

            {/* Class Group Actions */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <button 
                    className="py-2.5 px-4 bg-blue-50 border-2 border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-all"
                    onClick={onJoinClass}
                >
                    👥 Join Class Group
                </button>
                <button 
                    className="py-2.5 px-4 bg-green-50 border-2 border-green-200 text-green-700 text-sm font-medium rounded-lg hover:bg-green-100 transition-all"
                    onClick={onCreateClass}
                >
                    🏫 Create Class (Teachers)
                </button>
            </div>

            {children.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">👶</div>
                    <h3 className="text-lg text-gray-600 mb-2">No children added yet</h3>
                    <p className="text-sm">Click above to add your first child</p>
                </div>
            ) : (
                <div className="mt-6 space-y-3">
                    {children.map(child => {
                        // Find class groups this child is in
                        const childClasses = classGroups.filter(group => 
                            group.students.some(s => s.childId === child.id)
                        );

                        return (
                            <div key={child.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="font-semibold text-gray-800">{child.name}</div>
                                        {child.grade && (
                                            <div className="text-sm text-gray-500">Grade {child.grade}</div>
                                        )}
                                    </div>
                                    <button 
                                        className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                                        onClick={() => onDeleteChild(child.id)}
                                    >
                                        Delete
                                    </button>
                                </div>

                                {/* Show class memberships */}
                                {childClasses.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {childClasses.map(classGroup => (
                                            <div key={classGroup.id} className="p-2 bg-blue-50 rounded-lg flex items-center justify-between">
                                                <div className="text-sm">
                                                    <div className="font-medium text-blue-900">
                                                        👥 {classGroup.teacherName}'s {classGroup.grade}
                                                    </div>
                                                    <div className="text-xs text-blue-700">
                                                        {classGroup.school}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => onLeaveClass(classGroup.id, child.id)}
                                                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                                                >
                                                    Leave
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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

    const recommendation = grade ? getRecommendation(grade) : null;

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
                <h2 className="text-xl font-semibold mb-5 text-gray-800">Add Child</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter child's name"
                            autoFocus
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Age Group *</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={grade}
                                onChange={(e) => setGrade(e.target.value)}
                                placeholder="e.g., 2nd, K, 5"
                            />
                            {recommendation && (
                                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                    <div className="text-xs font-semibold text-purple-900 mb-1">
                                        📚 Recommended Reading Goal
                                    </div>
                                    <div className="text-sm text-purple-700">
                                        {recommendation.minutes} min/day • {recommendation.daysPerWeek} days/week
                                    </div>
                                    <div className="text-xs text-purple-600 mt-1">
                                        Based on {recommendation.label} guidelines
                                    </div>
                                </div>
                            )}
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
                                <li>✓ Hours tracking</li>
                                <li>✓ State-compliant reports</li>
                                <li>✓ Co-op group support</li>
                            </ul>
                        </div>
                    )}

                    <button type="submit" className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all mb-2">
                        Add Child
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

// Grade-based reading recommendations (based on education research)
const READING_RECOMMENDATIONS = {
    'K': { minutes: 10, daysPerWeek: 5, label: 'Kindergarten' },
    '1': { minutes: 15, daysPerWeek: 5, label: '1st Grade' },
    '2': { minutes: 20, daysPerWeek: 5, label: '2nd Grade' },
    '3': { minutes: 20, daysPerWeek: 5, label: '3rd Grade' },
    '4': { minutes: 25, daysPerWeek: 5, label: '4th Grade' },
    '5': { minutes: 30, daysPerWeek: 5, label: '5th Grade' },
    '6': { minutes: 30, daysPerWeek: 5, label: '6th Grade' },
    '7': { minutes: 35, daysPerWeek: 5, label: '7th Grade' },
    '8': { minutes: 40, daysPerWeek: 5, label: '8th Grade' },
    'default': { minutes: 20, daysPerWeek: 5, label: 'Elementary' }
};

const getRecommendation = (grade) => {
    if (!grade) return READING_RECOMMENDATIONS['default'];
    const normalized = grade.toString().toUpperCase().replace(/[^\dK]/g, '');
    return READING_RECOMMENDATIONS[normalized] || READING_RECOMMENDATIONS['default'];
};

// Popular children's books database (fallback for offline/testing)
const POPULAR_BOOKS = [
    // Baby Books (0-18 months)
    { title: "Goodnight Moon", author: "Margaret Wise Brown", ageGroup: "baby" },
    { title: "The Very Hungry Caterpillar", author: "Eric Carle", ageGroup: "baby" },
    { title: "Brown Bear, Brown Bear, What Do You See?", author: "Bill Martin Jr.", ageGroup: "baby" },
    { title: "Dear Zoo", author: "Rod Campbell", ageGroup: "baby" },
    { title: "Guess How Much I Love You", author: "Sam McBratney", ageGroup: "baby" },
    { title: "Pat the Bunny", author: "Dorothy Kunhardt", ageGroup: "baby" },
    { title: "Where Is Baby's Belly Button?", author: "Karen Katz", ageGroup: "baby" },
    { title: "Moo, Baa, La La La!", author: "Sandra Boynton", ageGroup: "baby" },
    
    // Toddler Books (18 months - 3 years)
    { title: "The Runaway Bunny", author: "Margaret Wise Brown", ageGroup: "toddler" },
    { title: "Llama Llama Red Pajama", author: "Anna Dewdney", ageGroup: "toddler" },
    { title: "Don't Let the Pigeon Drive the Bus!", author: "Mo Willems", ageGroup: "toddler" },
    { title: "The Gruffalo", author: "Julia Donaldson", ageGroup: "toddler" },
    { title: "Press Here", author: "Hervé Tullet", ageGroup: "toddler" },
    { title: "We're Going on a Bear Hunt", author: "Michael Rosen", ageGroup: "toddler" },
    
    // Preschool (3-5 years)
    { title: "Where the Wild Things Are", author: "Maurice Sendak", ageGroup: "preschool" },
    { title: "Corduroy", author: "Don Freeman", ageGroup: "preschool" },
    { title: "If You Give a Mouse a Cookie", author: "Laura Numeroff", ageGroup: "preschool" },
    { title: "The Rainbow Fish", author: "Marcus Pfister", ageGroup: "preschool" },
    { title: "Chicka Chicka Boom Boom", author: "Bill Martin Jr.", ageGroup: "preschool" },
    { title: "Clifford the Big Red Dog", author: "Norman Bridwell", ageGroup: "preschool" },
    
    // Early Elementary (K-2)
    { title: "The Cat in the Hat", author: "Dr. Seuss", ageGroup: "early-elementary" },
    { title: "Green Eggs and Ham", author: "Dr. Seuss", ageGroup: "early-elementary" },
    { title: "The Giving Tree", author: "Shel Silverstein", ageGroup: "early-elementary" },
    { title: "Charlotte's Web", author: "E.B. White", ageGroup: "elementary" },
    { title: "The Tale of Peter Rabbit", author: "Beatrix Potter", ageGroup: "early-elementary" },
    { title: "Magic Tree House: Dinosaurs Before Dark", author: "Mary Pope Osborne", ageGroup: "early-elementary" },
    { title: "Magic Tree House: The Knight at Dawn", author: "Mary Pope Osborne", ageGroup: "early-elementary" },
    { title: "Magic Tree House: Mummies in the Morning", author: "Mary Pope Osborne", ageGroup: "early-elementary" },
    { title: "The Magic School Bus Inside the Earth", author: "Joanna Cole", ageGroup: "early-elementary" },
    { title: "Frog and Toad Are Friends", author: "Arnold Lobel", ageGroup: "early-elementary" },
    { title: "Amelia Bedelia", author: "Peggy Parish", ageGroup: "early-elementary" },
    
    // Elementary (3-5)
    { title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling", ageGroup: "elementary" },
    { title: "Harry Potter and the Chamber of Secrets", author: "J.K. Rowling", ageGroup: "elementary" },
    { title: "Harry Potter and the Prisoner of Azkaban", author: "J.K. Rowling", ageGroup: "elementary" },
    { title: "Diary of a Wimpy Kid", author: "Jeff Kinney", ageGroup: "elementary" },
    { title: "Percy Jackson and the Lightning Thief", author: "Rick Riordan", ageGroup: "elementary" },
    { title: "Wonder", author: "R.J. Palacio", ageGroup: "elementary" },
    { title: "The Lion, the Witch and the Wardrobe", author: "C.S. Lewis", ageGroup: "elementary" },
    { title: "Matilda", author: "Roald Dahl", ageGroup: "elementary" },
    { title: "Charlie and the Chocolate Factory", author: "Roald Dahl", ageGroup: "elementary" },
    { title: "The BFG", author: "Roald Dahl", ageGroup: "elementary" },
    { title: "James and the Giant Peach", author: "Roald Dahl", ageGroup: "elementary" },
    { title: "Captain Underpants", author: "Dav Pilkey", ageGroup: "elementary" },
    { title: "Dog Man", author: "Dav Pilkey", ageGroup: "elementary" },
    { title: "Junie B. Jones", author: "Barbara Park", ageGroup: "elementary" },
    { title: "The Boxcar Children", author: "Gertrude Chandler Warner", ageGroup: "elementary" },
    { title: "Nancy Drew: The Secret of the Old Clock", author: "Carolyn Keene", ageGroup: "elementary" },
    { title: "Hardy Boys: The Tower Treasure", author: "Franklin W. Dixon", ageGroup: "elementary" },
    { title: "Ramona the Pest", author: "Beverly Cleary", ageGroup: "elementary" },
    { title: "Because of Winn-Dixie", author: "Kate DiCamillo", ageGroup: "elementary" },
    { title: "Bridge to Terabithia", author: "Katherine Paterson", ageGroup: "elementary" },
    { title: "Holes", author: "Louis Sachar", ageGroup: "elementary" },
    { title: "Hatchet", author: "Gary Paulsen", ageGroup: "elementary" },
    { title: "The Giver", author: "Lois Lowry", ageGroup: "middle" },
    { title: "Number the Stars", author: "Lois Lowry", ageGroup: "elementary" },
    { title: "Tuck Everlasting", author: "Natalie Babbitt", ageGroup: "elementary" },
    { title: "A Wrinkle in Time", author: "Madeleine L'Engle", ageGroup: "elementary" },
    { title: "The Secret Garden", author: "Frances Hodgson Burnett", ageGroup: "elementary" },
    { title: "Anne of Green Gables", author: "L.M. Montgomery", ageGroup: "elementary" },
    { title: "Little House on the Prairie", author: "Laura Ingalls Wilder", ageGroup: "elementary" },
    { title: "The Hobbit", author: "J.R.R. Tolkien", ageGroup: "middle" },
    { title: "The Chronicles of Narnia: Prince Caspian", author: "C.S. Lewis", ageGroup: "elementary" }
];

// Add Log Modal
function AddLogModal({ children, logs, onClose, onAdd }) {
    const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || '');
    const [bookTitle, setBookTitle] = useState('');
    const [minutes, setMinutes] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState('');
    const [coverUrl, setCoverUrl] = useState(null);
    const [coverLoading, setCoverLoading] = useState(false);

    const quickMinutes = [10, 15, 20, 30];

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

    // Search books (offline database + eventually Google Books API)
    const searchBooks = (query) => {
        if (query.length < 2) {
            setSuggestions([]);
            return;
        }

        setIsSearching(true);
        
        // Search in our offline database
        const lowerQuery = query.toLowerCase();
        const matches = POPULAR_BOOKS.filter(book => 
            book.title.toLowerCase().includes(lowerQuery) ||
            book.author.toLowerCase().includes(lowerQuery)
        ).slice(0, 8);
        
        setSuggestions(matches);
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

    const selectBook = async (title, author) => {
        const fullTitle = author ? `${title} by ${author}` : title;
        setBookTitle(fullTitle);
        setShowSuggestions(false);
        setSuggestions([]);
        
        // Fetch book cover
        setCoverLoading(true);
        const cover = await fetchBookCover(title);
        setCoverUrl(cover);
        setCoverLoading(false);
    };

    // Fetch cover when book title changes (debounced)
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (bookTitle && bookTitle.length > 3 && !showSuggestions) {
                setCoverLoading(true);
                const cover = await fetchBookCover(bookTitle);
                setCoverUrl(cover);
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
        console.log('Voice transcript:', transcript);

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
            onAdd(selectedChildId, bookTitle.trim(), minutes, date, null, null, coverUrl);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">Log Reading Session</h2>
                
                {/* Voice Input Section */}
                {isSpeechSupported && (
                    <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl border-2 border-purple-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">🎤</span>
                                <span className="text-sm font-semibold text-purple-900">Quick Voice Log</span>
                            </div>
                        </div>
                        <p className="text-xs text-purple-700 mb-3">
                            Say: "Emma, Charlotte's Web, 20 minutes"
                        </p>
                        <button
                            type="button"
                            onClick={startVoiceLogging}
                            disabled={isListening}
                            className={`w-full py-3 rounded-lg font-medium transition-all ${
                                isListening 
                                    ? 'bg-red-500 text-white animate-pulse' 
                                    : 'bg-purple-600 text-white hover:bg-purple-700'
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
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                                                className="w-full text-left px-3 py-2.5 hover:bg-purple-50 border-b border-gray-100 transition-colors"
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
                                                        className="w-full text-left px-3 py-2.5 hover:bg-purple-50 border-b border-gray-100 transition-colors"
                                                        onClick={() => selectBook(book.title, book.author)}
                                                    >
                                                        <div className="text-sm font-medium text-gray-800">
                                                            {book.title}
                                                        </div>
                                                        {book.author && (
                                                            <div className="text-xs text-gray-500">
                                                                by {book.author}
                                                            </div>
                                                        )}
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
                                    className="w-16 h-24 object-cover rounded shadow-md"
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

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Minutes *</label>
                        <input
                            type="number"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                                            ? 'bg-purple-600 text-white border-2 border-purple-600' 
                                            : 'bg-gray-100 text-gray-700 border-2 border-gray-200 hover:bg-purple-600 hover:text-white hover:border-purple-600'
                                    }`}
                                    onClick={() => setMinutes(m.toString())}
                                >
                                    {m}m
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                        <input
                            type="date"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    <button type="submit" className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all mb-2">
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

    const recommendation = getRecommendation(child.grade);
    const isUsingRecommendation = 
        minutesPerDay === recommendation.minutes && 
        daysPerWeek === recommendation.daysPerWeek;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(parseInt(minutesPerDay), parseInt(daysPerWeek));
    };

    const useRecommendation = () => {
        setMinutesPerDay(recommendation.minutes);
        setDaysPerWeek(recommendation.daysPerWeek);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    Edit Reading Goal for {child.name}
                </h2>

                {child.grade && (
                    <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="text-sm font-medium text-purple-900 mb-1">
                            📚 Recommended for {child.grade}
                        </div>
                        <div className="text-sm text-purple-700 mb-2">
                            {recommendation.minutes} minutes/day • {recommendation.daysPerWeek} days/week
                        </div>
                        {!isUsingRecommendation && (
                            <button
                                type="button"
                                onClick={useRecommendation}
                                className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                            >
                                Use Recommended Goal
                            </button>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Minutes per day
                        </label>
                        <input
                            type="number"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={minutesPerDay}
                            onChange={(e) => setMinutesPerDay(e.target.value)}
                            min="5"
                            max="120"
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Days per week
                        </label>
                        <input
                            type="number"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={daysPerWeek}
                            onChange={(e) => setDaysPerWeek(e.target.value)}
                            min="1"
                            max="7"
                            required
                        />
                    </div>

                    <div className="text-sm text-gray-600 mb-4 p-3 bg-gray-50 rounded-lg">
                        Weekly goal: <strong>{minutesPerDay * daysPerWeek} minutes</strong>
                    </div>

                    <button type="submit" className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all mb-2">
                        Save Goal
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

// Report Modal Component
function ReportModal({ child, logs, onClose }) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isGenerating, setIsGenerating] = useState(false);

    // Set default start date to 30 days ago
    useEffect(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
    }, []);

    const quickRanges = [
        { label: 'Last 7 Days', days: 7 },
        { label: 'Last 30 Days', days: 30 },
        { label: 'This Month', days: 'month' },
        { label: 'All Time', days: 'all' }
    ];

    const setQuickRange = (range) => {
        if (range === 'all') {
            if (logs.length > 0) {
                const dates = logs.map(l => new Date(l.date));
                setStartDate(new Date(Math.min(...dates)).toISOString().split('T')[0]);
            }
            setEndDate(new Date().toISOString().split('T')[0]);
        } else if (range === 'month') {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            setStartDate(monthStart.toISOString().split('T')[0]);
            setEndDate(now.toISOString().split('T')[0]);
        } else {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - range);
            setStartDate(start.toISOString().split('T')[0]);
            setEndDate(end.toISOString().split('T')[0]);
        }
    };

    const generateReport = async () => {
        setIsGenerating(true);
        try {
            // Filter logs by date range
            const filteredLogs = logs.filter(log => {
                const logDate = new Date(log.date);
                return logDate >= new Date(startDate) && logDate <= new Date(endDate);
            });

            // Call the Claude API to generate PDF
            const response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 4000,
                    messages: [
                        {
                            role: "user",
                            content: `Create a professional reading log PDF report for a child. Use Python with reportlab library.

Child Information:
- Name: ${child.name}
- Grade: ${child.grade || 'Not specified'}
- Reading Goal: ${child.goal?.minutesPerDay || 20} minutes/day, ${child.goal?.daysPerWeek || 5} days/week

Report Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}

Reading Sessions (${filteredLogs.length} total):
${filteredLogs.map(log => `- ${new Date(log.date).toLocaleDateString()}: ${log.bookTitle} - ${log.minutes} minutes`).join('\n')}

Statistics:
- Total Minutes: ${filteredLogs.reduce((sum, log) => sum + log.minutes, 0)}
- Total Books: ${new Set(filteredLogs.map(l => l.bookTitle)).size}
- Days Read: ${new Set(filteredLogs.map(l => l.date)).size}
- Average Minutes per Session: ${Math.round(filteredLogs.reduce((sum, log) => sum + log.minutes, 0) / filteredLogs.length) || 0}

Create a clean, professional PDF with:
1. Header with child's name and report period
2. Summary statistics in a nice layout
3. Detailed reading log table (date, book title, minutes)
4. Parent signature line at bottom
5. School-ready formatting

Save the PDF to /mnt/user-data/outputs/${child.name.replace(/\s+/g, '_')}_Reading_Report.pdf

Use reportlab to create a beautiful, print-ready document.`
                        }
                    ],
                })
            });

            const data = await response.json();
            
            // Check if PDF was created successfully
            const pdfCreated = data.content?.some(block => 
                block.type === 'text' && block.text.includes('Reading_Report.pdf')
            );

            if (pdfCreated) {
                alert(`Report generated successfully! Check your downloads for ${child.name}'s reading report.`);
                onClose();
            } else {
                alert('Report generation in progress. Please check the outputs folder.');
            }
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Failed to generate report. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const filteredLogs = logs.filter(log => {
        if (!startDate || !endDate) return true;
        const logDate = new Date(log.date);
        return logDate >= new Date(startDate) && logDate <= new Date(endDate);
    });

    const totalMinutes = filteredLogs.reduce((sum, log) => sum + log.minutes, 0);
    const uniqueBooks = new Set(filteredLogs.map(l => l.bookTitle)).size;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    📄 Generate Reading Report for {child.name}
                </h2>

                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm font-medium text-blue-900 mb-2">
                        This report will include:
                    </div>
                    <ul className="text-sm text-blue-700 space-y-1">
                        <li>✓ Professional PDF format</li>
                        <li>✓ Summary statistics</li>
                        <li>✓ Detailed reading log</li>
                        <li>✓ Ready to submit to teachers</li>
                    </ul>
                </div>

                {/* Quick Range Buttons */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quick Select:</label>
                    <div className="grid grid-cols-2 gap-2">
                        {quickRanges.map(range => (
                            <button
                                key={range.label}
                                type="button"
                                onClick={() => setQuickRange(range.days)}
                                className="px-3 py-2 bg-gray-100 hover:bg-purple-100 text-sm font-medium rounded-lg transition-colors"
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Date Range */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Custom Date Range:</label>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Start Date</label>
                            <input
                                type="date"
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                max={endDate}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">End Date</label>
                            <input
                                type="date"
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </div>
                    </div>
                </div>

                {/* Preview Stats */}
                <div className="mb-5 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="text-sm font-medium text-purple-900 mb-2">Report Preview:</div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <div className="text-2xl font-bold text-purple-600">{filteredLogs.length}</div>
                            <div className="text-xs text-purple-700">Sessions</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-purple-600">{totalMinutes}</div>
                            <div className="text-xs text-purple-700">Minutes</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-purple-600">{uniqueBooks}</div>
                            <div className="text-xs text-purple-700">Books</div>
                        </div>
                    </div>
                </div>

                {filteredLogs.length === 0 && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                        ⚠️ No reading sessions found in this date range
                    </div>
                )}

                <button
                    onClick={generateReport}
                    disabled={isGenerating || filteredLogs.length === 0}
                    className={`w-full py-3.5 px-6 rounded-lg font-medium transition-all mb-2 ${
                        isGenerating || filteredLogs.length === 0
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                >
                    {isGenerating ? '⏳ Generating Report...' : '📄 Generate PDF Report'}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isGenerating}
                    className="w-full bg-gray-200 text-gray-700 py-3.5 px-6 rounded-lg font-medium hover:bg-gray-300 transition-all"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// Challenges View Component
function ChallengesView({ children, logs, challenges, onCreateChallenge, onJoinChallenge, onLeaveChallenge }) {
    const [selectedChallenge, setSelectedChallenge] = useState(null);

    // Helper function to calculate challenge progress
    const calculateProgress = (challenge, childId) => {
        const participantData = challenge.participants?.find(p => p.childId === childId);
        if (!participantData) return null;

        const challengeLogs = logs.filter(log => {
            const logDate = new Date(log.date);
            const startDate = new Date(challenge.startDate);
            const endDate = new Date(challenge.endDate);
            return log.childId === childId && logDate >= startDate && logDate <= endDate;
        });

        let current = 0;
        if (challenge.goalType === 'books') {
            current = new Set(challengeLogs.map(l => l.bookTitle)).size;
        } else if (challenge.goalType === 'minutes') {
            current = challengeLogs.reduce((sum, l) => sum + l.minutes, 0);
        } else if (challenge.goalType === 'days') {
            current = new Set(challengeLogs.map(l => l.date)).size;
        }

        const progress = Math.min(100, Math.round((current / challenge.goalTarget) * 100));
        const milestone = getMilestone(challenge, progress);

        return { current, progress, milestone, challengeLogs };
    };

    const getMilestone = (challenge, progress) => {
        if (!challenge.milestones) return null;
        const sorted = [...challenge.milestones].sort((a, b) => b.threshold - a.threshold);
        return sorted.find(m => progress >= m.threshold);
    };

    // Filter active vs past challenges
    const now = new Date();
    const activeChallenges = challenges.filter(c => new Date(c.endDate) >= now);
    const pastChallenges = challenges.filter(c => new Date(c.endDate) < now);

    if (children.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <div className="text-6xl mb-4">👶</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a child first</h3>
                <p className="text-sm">Go to the Kids tab to get started</p>
            </div>
        );
    }

    return (
        <div>
            <button 
                className="w-full bg-green-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-green-700 transition-all mb-5"
                onClick={onCreateChallenge}
            >
                🏆 Create Read-a-Thon Challenge
            </button>

            {/* Active Challenges */}
            {activeChallenges.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Active Challenges</h3>
                    {activeChallenges.map(challenge => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            children={children}
                            calculateProgress={calculateProgress}
                            onJoinChallenge={onJoinChallenge}
                            onLeaveChallenge={onLeaveChallenge}
                            onViewDetails={() => setSelectedChallenge(challenge)}
                        />
                    ))}
                </div>
            )}

            {/* Past Challenges */}
            {pastChallenges.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold mb-3 text-gray-500">Past Challenges</h3>
                    {pastChallenges.map(challenge => (
                        <ChallengeCard
                            key={challenge.id}
                            challenge={challenge}
                            children={children}
                            calculateProgress={calculateProgress}
                            isPast={true}
                        />
                    ))}
                </div>
            )}

            {challenges.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">🏆</div>
                    <h3 className="text-lg text-gray-600 mb-2">No challenges yet</h3>
                    <p className="text-sm">Create a read-a-thon to get started!</p>
                </div>
            )}

            {/* Challenge Details Modal */}
            {selectedChallenge && (
                <ChallengeDetailsModal
                    challenge={selectedChallenge}
                    children={children}
                    logs={logs}
                    calculateProgress={calculateProgress}
                    onClose={() => setSelectedChallenge(null)}
                />
            )}
        </div>
    );
}

// Challenge Card Component
function ChallengeCard({ challenge, children, calculateProgress, onJoinChallenge, onLeaveChallenge, onViewDetails, isPast }) {
    const daysLeft = Math.ceil((new Date(challenge.endDate) - new Date()) / (1000 * 60 * 60 * 24));
    const hasEnded = daysLeft < 0;

    return (
        <div className="bg-white border-2 border-green-200 rounded-xl p-4 mb-3 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h4 className="font-semibold text-gray-800 text-lg">{challenge.name}</h4>
                    <p className="text-sm text-gray-600">
                        {new Date(challenge.startDate).toLocaleDateString()} - {new Date(challenge.endDate).toLocaleDateString()}
                    </p>
                </div>
                {!hasEnded && !isPast && (
                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                        {daysLeft} days left
                    </span>
                )}
                {hasEnded && (
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                        Ended
                    </span>
                )}
            </div>

            <div className="mb-3 p-3 bg-green-50 rounded-lg">
                <div className="text-sm font-medium text-green-900">
                    Goal: {challenge.goalTarget} {challenge.goalType}
                </div>
            </div>

            {/* Show participating children */}
            {children.map(child => {
                const isParticipating = challenge.participants?.some(p => p.childId === child.id);
                const progressData = isParticipating ? calculateProgress(challenge, child.id) : null;

                return (
                    <div key={child.id} className="mb-2 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-800">{child.name}</span>
                            {!isPast && (
                                isParticipating ? (
                                    <button
                                        onClick={() => onLeaveChallenge(challenge.id, child.id)}
                                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                                    >
                                        Leave Challenge
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => onJoinChallenge(challenge.id, child.id)}
                                        className="text-xs text-green-600 hover:text-green-800 font-medium"
                                    >
                                        + Join Challenge
                                    </button>
                                )
                            )}
                        </div>

                        {progressData && (
                            <div>
                                <div className="flex justify-between text-xs text-gray-600 mb-1">
                                    <span>{progressData.current} of {challenge.goalTarget} {challenge.goalType}</span>
                                    <span className="font-semibold">{progressData.progress}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div 
                                        className="bg-green-500 h-full transition-all duration-500"
                                        style={{ width: `${progressData.progress}%` }}
                                    />
                                </div>
                                {progressData.milestone && (
                                    <div className="mt-1 text-xs font-medium text-green-700">
                                        {progressData.milestone.icon} {progressData.milestone.name}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {onViewDetails && (
                <button
                    onClick={onViewDetails}
                    className="w-full mt-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
                >
                    View Leaderboard & Details
                </button>
            )}
        </div>
    );
}

// Create Challenge Modal Component
function CreateChallengeModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState('');
    const [goalType, setGoalType] = useState('books');
    const [goalTarget, setGoalTarget] = useState(20);
    const [addMilestones, setAddMilestones] = useState(true);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const milestones = addMilestones ? [
            { threshold: 33, name: 'Bronze Medal', icon: '🥉' },
            { threshold: 66, name: 'Silver Medal', icon: '🥈' },
            { threshold: 100, name: 'Gold Medal', icon: '🥇' }
        ] : [];

        onCreate({
            name,
            startDate,
            endDate,
            goalType,
            goalTarget: parseInt(goalTarget),
            milestones
        });
    };

    // Quick templates
    const templates = [
        { name: 'February Read-a-Thon', days: 28, goalType: 'books', goalTarget: 20 },
        { name: 'Summer Reading Challenge', days: 90, goalType: 'minutes', goalTarget: 1000 },
        { name: '100 Days of Reading', days: 100, goalType: 'days', goalTarget: 100 },
        { name: 'March Reading Month', days: 31, goalType: 'books', goalTarget: 25 }
    ];

    const useTemplate = (template) => {
        setName(template.name);
        const end = new Date();
        end.setDate(end.getDate() + template.days);
        setEndDate(end.toISOString().split('T')[0]);
        setGoalType(template.goalType);
        setGoalTarget(template.goalTarget);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    🏆 Create Read-a-Thon Challenge
                </h2>

                {/* Quick Templates */}
                <div className="mb-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quick Templates:</label>
                    <div className="grid grid-cols-2 gap-2">
                        {templates.map(template => (
                            <button
                                key={template.name}
                                type="button"
                                onClick={() => useTemplate(template)}
                                className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-sm font-medium rounded-lg transition-colors text-left"
                            >
                                {template.name}
                            </button>
                        ))}
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Challenge Name *</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., February Read-a-Thon"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date *</label>
                            <input
                                type="date"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">End Date *</label>
                            <input
                                type="date"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                min={startDate}
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Goal Type *</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            value={goalType}
                            onChange={(e) => setGoalType(e.target.value)}
                        >
                            <option value="books">Books Read</option>
                            <option value="minutes">Minutes Read</option>
                            <option value="days">Days Read</option>
                        </select>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Goal Target * ({goalType === 'books' ? 'number of books' : goalType === 'minutes' ? 'total minutes' : 'number of days'})
                        </label>
                        <input
                            type="number"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            value={goalTarget}
                            onChange={(e) => setGoalTarget(e.target.value)}
                            min="1"
                            required
                        />
                    </div>

                    <div className="mb-5">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={addMilestones}
                                onChange={(e) => setAddMilestones(e.target.checked)}
                                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                            />
                            <span className="text-sm font-medium text-gray-700">
                                Add milestones (Bronze 🥉 Silver 🥈 Gold 🥇)
                            </span>
                        </label>
                    </div>

                    <button type="submit" className="w-full bg-green-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-green-700 transition-all mb-2">
                        Create Challenge
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

// Challenge Details Modal with Leaderboard
function ChallengeDetailsModal({ challenge, children, logs, calculateProgress, onClose }) {
    // Calculate leaderboard
    const leaderboard = children
        .map(child => {
            const progressData = calculateProgress(challenge, child.id);
            if (!progressData) return null;
            
            const participant = challenge.participants?.find(p => p.childId === child.id);
            if (!participant || !participant.showOnLeaderboard) return null;

            return {
                name: child.name,
                ...progressData
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.current - a.current);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-3 text-gray-800">
                    {challenge.name}
                </h2>
                <p className="text-sm text-gray-600 mb-5">
                    {new Date(challenge.startDate).toLocaleDateString()} - {new Date(challenge.endDate).toLocaleDateString()}
                </p>

                <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm font-medium text-green-900 mb-1">Challenge Goal</div>
                    <div className="text-2xl font-bold text-green-700">
                        {challenge.goalTarget} {challenge.goalType}
                    </div>
                </div>

                {leaderboard.length > 0 ? (
                    <div>
                        <h3 className="text-lg font-semibold mb-3">🏆 Leaderboard</h3>
                        <div className="space-y-2">
                            {leaderboard.map((entry, index) => (
                                <div key={index} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl font-bold text-gray-400">
                                            #{index + 1}
                                        </span>
                                        <div>
                                            <div className="font-medium text-gray-800">{entry.name}</div>
                                            <div className="text-sm text-gray-600">
                                                {entry.current} {challenge.goalType}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-lg font-bold text-green-600">{entry.progress}%</div>
                                        {entry.milestone && (
                                            <div className="text-sm">{entry.milestone.icon}</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-400">
                        <p className="text-sm">No participants yet</p>
                    </div>
                )}

                <button 
                    type="button" 
                    className="w-full mt-5 bg-gray-200 text-gray-700 py-3.5 px-6 rounded-lg font-medium hover:bg-gray-300 transition-all"
                    onClick={onClose}
                >
                    Close
                </button>
            </div>
        </div>
    );
}

// Join Class Modal Component
function JoinClassModal({ children, onClose, onJoin }) {
    const [joinCode, setJoinCode] = useState('');
    const [selectedChild, setSelectedChild] = useState('');
    const [parentConsent, setParentConsent] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!parentConsent) {
            alert('Please consent to share progress with the teacher.');
            return;
        }
        const success = onJoin(joinCode.trim(), selectedChild, parentConsent);
        if (success) {
            alert('Successfully joined class group!');
        }
    };

    if (children.length === 0) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
                <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-xl font-semibold mb-3 text-gray-800">Add a Child First</h2>
                    <p className="text-gray-600 mb-5">You need to add at least one child before joining a class group.</p>
                    <button 
                        className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium hover:bg-gray-300"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    👥 Join Class Group
                </h2>

                <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm font-medium text-blue-900 mb-2">
                        How to join:
                    </div>
                    <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                        <li>Get the class code from your teacher</li>
                        <li>Enter it below</li>
                        <li>Select your child</li>
                        <li>Give consent to share progress</li>
                    </ol>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Class Join Code *
                        </label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg font-mono uppercase"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="ABC123"
                            maxLength={6}
                            required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Enter the 6-character code from your teacher
                        </p>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Child *
                        </label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={selectedChild}
                            onChange={(e) => setSelectedChild(e.target.value)}
                            required
                        >
                            <option value="">Choose a child...</option>
                            {children.map(child => (
                                <option key={child.id} value={child.id}>
                                    {child.name} {child.grade ? `(Grade ${child.grade})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={parentConsent}
                                onChange={(e) => setParentConsent(e.target.checked)}
                                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">
                                <strong>I consent</strong> to share my child's reading progress (books read, minutes, goal completion) with their teacher. The teacher will see aggregate class stats and individual progress if I opt to show on leaderboards.
                            </span>
                        </label>
                    </div>

                    <button 
                        type="submit" 
                        className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-blue-700 transition-all mb-2"
                    >
                        Join Class Group
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

// Create Class Modal Component (For Teachers)
function CreateClassModal({ onClose, onCreate }) {
    const [teacherName, setTeacherName] = useState('');
    const [grade, setGrade] = useState('');
    const [school, setSchool] = useState('');
    const [createdCode, setCreatedCode] = useState(null);

    const handleSubmit = (e) => {
        e.preventDefault();
        const code = onCreate({
            teacherName,
            grade,
            school
        });
        setCreatedCode(code);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(createdCode);
        alert('Join code copied to clipboard!');
    };

    const getShareMessage = () => {
        return `Join our class reading group!\n\nClass: ${teacherName}'s ${grade}\nSchool: ${school}\n\nJoin Code: ${createdCode}\n\nDownload the Kids Reading Log app and use this code to join our class group. Track your child's reading and see class progress!`;
    };

    const copyShareMessage = () => {
        navigator.clipboard.writeText(getShareMessage());
        alert('Message copied! Paste this into your email or class newsletter.');
    };

    if (createdCode) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
                <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-xl font-semibold mb-3 text-gray-800">
                        ✅ Class Group Created!
                    </h2>

                    <div className="mb-5 p-6 bg-green-50 border-2 border-green-200 rounded-xl text-center">
                        <div className="text-sm font-medium text-green-900 mb-2">
                            Your Class Join Code
                        </div>
                        <div className="text-4xl font-bold font-mono text-green-700 mb-3 tracking-wider">
                            {createdCode}
                        </div>
                        <button
                            onClick={copyToClipboard}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-all"
                        >
                            📋 Copy Code
                        </button>
                    </div>

                    <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-sm font-medium text-blue-900 mb-2">
                            Share with Parents:
                        </div>
                        <div className="text-sm text-blue-700 mb-3 whitespace-pre-line bg-white p-3 rounded border border-blue-200">
                            {getShareMessage()}
                        </div>
                        <button
                            onClick={copyShareMessage}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all"
                        >
                            📧 Copy Full Message
                        </button>
                    </div>

                    <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
                        <strong>💡 Tip:</strong> Bookmark this page or save your join code. You can view your class dashboard anytime to see student progress!
                    </div>

                    <button 
                        className="w-full bg-gray-200 text-gray-700 py-3.5 px-6 rounded-lg font-medium hover:bg-gray-300 transition-all"
                        onClick={onClose}
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    🏫 Create Class Group
                </h2>

                <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm font-medium text-green-900 mb-2">
                        For Teachers:
                    </div>
                    <ul className="text-sm text-green-700 space-y-1">
                        <li>✓ Free for all teachers</li>
                        <li>✓ Get a simple join code</li>
                        <li>✓ Parents join with the code</li>
                        <li>✓ See class reading progress</li>
                        <li>✓ No login required</li>
                    </ul>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Teacher Name *
                        </label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            value={teacherName}
                            onChange={(e) => setTeacherName(e.target.value)}
                            placeholder="Mrs. Johnson"
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Grade/Class *
                        </label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            placeholder="2nd Grade"
                            required
                        />
                    </div>

                    <div className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            School Name *
                        </label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            value={school}
                            onChange={(e) => setSchool(e.target.value)}
                            placeholder="Lincoln Elementary"
                            required
                        />
                    </div>

                    <button 
                        type="submit" 
                        className="w-full bg-green-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-green-700 transition-all mb-2"
                    >
                        Create Class & Get Join Code
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

// Goals View Component
function GoalsView({ children, goals, logs, challenges, onCreateGoal, onCompleteGoal, onDeleteGoal }) {
    if (children.length === 0) {
        return (
            <div className="text-center py-16 text-gray-400">
                <div className="text-6xl mb-4">👶</div>
                <h3 className="text-lg text-gray-600 mb-2">Add a child first</h3>
                <p className="text-sm">Go to the Kids tab to get started</p>
            </div>
        );
    }

    // Group goals by child
    const goalsByChild = {};
    children.forEach(child => {
        goalsByChild[child.id] = goals.filter(g => g.childId === child.id && !g.completed);
    });

    const completedGoals = goals.filter(g => g.completed).slice(0, 5);

    // Get active school read-a-thons
    const now = new Date();
    const activeReadathons = challenges.filter(c => new Date(c.endDate) >= now);

    // Check if this is first time user
    const isFirstTime = goals.length === 0 && activeReadathons.length === 0;

    return (
        <div>
            {isFirstTime && (
                <div className="mb-6 p-5 bg-blue-50 border-2 border-blue-200 rounded-xl">
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">🎯 What are Reading Goals?</h3>
                    <p className="text-sm text-blue-700 mb-3">
                        Reading goals are what you and your child are working on together - like "read a chapter book" or "read every night this week."
                    </p>
                    <p className="text-sm text-blue-700">
                        Set a goal, track progress, and celebrate when you complete it!
                    </p>
                </div>
            )}

            <button 
                className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all mb-5"
                onClick={onCreateGoal}
            >
                + Set New Goal
            </button>

            {/* Active Goals by Child */}
            {children.map(child => {
                const childGoals = goalsByChild[child.id] || [];
                if (childGoals.length === 0) return null;

                return (
                    <div key={child.id} className="mb-6">
                        <h3 className="text-lg font-semibold mb-3">{child.name}'s Goals</h3>
                        {childGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                child={child}
                                logs={logs}
                                onComplete={() => onCompleteGoal(goal.id)}
                                onDelete={() => onDeleteGoal(goal.id)}
                            />
                        ))}
                    </div>
                );
            })}

            {goals.filter(g => !g.completed).length === 0 && !isFirstTime && (
                <div className="text-center py-12 text-gray-400">
                    <div className="text-5xl mb-3">📖</div>
                    <p className="text-sm">No active goals. Set one to get started!</p>
                </div>
            )}

            {/* School Read-a-Thons Section */}
            {activeReadathons.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-3">School Read-a-Thons</h3>
                    <p className="text-sm text-gray-600 mb-3">
                        These are school-wide events created by teachers.
                    </p>
                    {activeReadathons.map(challenge => {
                        const childInChallenge = challenge.participants?.find(p => 
                            children.some(c => c.id === p.childId)
                        );
                        if (!childInChallenge) return null;

                        const child = children.find(c => c.id === childInChallenge.childId);
                        return (
                            <div key={challenge.id} className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-3">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="font-semibold text-gray-800">{challenge.name}</div>
                                        <div className="text-sm text-gray-600">{child?.name}</div>
                                    </div>
                                    <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                        School Event
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600 mb-2">
                                    Goal: {challenge.goalTarget} {challenge.goalType}
                                </div>
                                <div className="text-sm text-gray-600">
                                    Ends: {new Date(challenge.endDate).toLocaleDateString()}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Completed Goals */}
            {completedGoals.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-3 text-gray-500">Recently Completed</h3>
                    {completedGoals.map(goal => {
                        const child = children.find(c => c.id === goal.childId);
                        return (
                            <div key={goal.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-2 opacity-70">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="font-medium text-gray-700">✓ {goal.name}</div>
                                        <div className="text-sm text-gray-600">{child?.name}</div>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {new Date(goal.completedDate).toLocaleDateString()}
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

// Goal Card Component
function GoalCard({ goal, child, logs, onComplete, onDelete }) {
    // Calculate progress if measurable
    let progressData = null;
    
    if (goal.goalType !== 'completion') {
        const goalLogs = logs.filter(log => {
            const logDate = new Date(log.date);
            const goalStart = new Date(goal.createdDate);
            const goalEnd = goal.endDate ? new Date(goal.endDate) : new Date();
            return log.childId === child.id && logDate >= goalStart && logDate <= goalEnd;
        });

        let current = 0;
        if (goal.goalType === 'books') {
            current = new Set(goalLogs.map(l => l.bookTitle)).size;
        } else if (goal.goalType === 'minutes') {
            current = goalLogs.reduce((sum, l) => sum + l.minutes, 0);
        } else if (goal.goalType === 'days') {
            current = new Set(goalLogs.map(l => l.date)).size;
        }

        const progress = Math.min(100, Math.round((current / goal.goalTarget) * 100));
        progressData = { current, progress };
    }

    return (
        <div className="bg-white border-2 border-purple-200 rounded-xl p-4 mb-3 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <h4 className="font-semibold text-gray-800 text-lg">📖 {goal.name}</h4>
                    <p className="text-sm text-gray-600">
                        Started: {new Date(goal.createdDate).toLocaleDateString()}
                    </p>
                </div>
                <button
                    onClick={onDelete}
                    className="text-red-500 hover:text-red-700 text-sm px-2 py-1"
                >
                    Delete
                </button>
            </div>

            {goal.description && (
                <p className="text-sm text-gray-600 mb-3">{goal.description}</p>
            )}

            {progressData ? (
                <div className="mb-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>{progressData.current} of {goal.goalTarget} {goal.goalType}</span>
                        <span className="font-semibold">{progressData.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div 
                            className="bg-purple-600 h-full transition-all duration-500"
                            style={{ width: `${progressData.progress}%` }}
                        />
                    </div>
                </div>
            ) : (
                <div className="mb-3 text-sm text-gray-600">
                    Working on it together...
                </div>
            )}

            {goal.currentBook && (
                <div className="text-sm text-gray-600 mb-3">
                    Currently reading: <span className="font-medium">{goal.currentBook}</span>
                </div>
            )}

            <button
                onClick={onComplete}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all"
            >
                ✓ Mark Complete
            </button>
        </div>
    );
}

// Create Goal Modal Component
function CreateGoalModal({ children, onClose, onCreate }) {
    const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || '');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [goalType, setGoalType] = useState('completion');
    const [goalTarget, setGoalTarget] = useState(1);
    const [endDate, setEndDate] = useState('');
    const [currentBook, setCurrentBook] = useState('');

    const selectedChild = children.find(c => c.id === selectedChildId);

    // Age-appropriate templates
    const getTemplates = () => {
        const childType = selectedChild?.childType || 'student';

        const templates = {
            baby: [
                { name: 'Read to baby 10 minutes daily', goalType: 'completion' },
                { name: 'Read 5 board books this week', goalType: 'books', goalTarget: 5 },
                { name: 'Try touch-and-feel books', goalType: 'completion' },
                { name: 'Read the same book 3 times', goalType: 'completion' }
            ],
            toddler: [
                { name: 'Read together every night this week', goalType: 'days', goalTarget: 7 },
                { name: 'Try 5 different picture books', goalType: 'books', goalTarget: 5 },
                { name: 'Let them pick the book tonight', goalType: 'completion' },
                { name: 'Read a book about animals', goalType: 'completion' }
            ],
            preschool: [
                { name: 'Read together every night', goalType: 'days', goalTarget: 7 },
                { name: 'Try 5 new books this month', goalType: 'books', goalTarget: 5 },
                { name: 'Read a book about letters', goalType: 'completion' },
                { name: 'Read books about numbers', goalType: 'completion' }
            ],
            student: [
                { name: 'Read a chapter book', goalType: 'completion' },
                { name: 'Read 10 books this month', goalType: 'books', goalTarget: 10 },
                { name: 'Try a new genre', goalType: 'completion' },
                { name: 'Finish a book series', goalType: 'completion' },
                { name: 'Read 15 minutes daily', goalType: 'days', goalTarget: 30 }
            ],
            homeschool: [
                { name: 'Read a chapter book', goalType: 'completion' },
                { name: 'Read a biography', goalType: 'completion' },
                { name: 'Read across 3 subjects', goalType: 'completion' },
                { name: 'Complete a literature unit', goalType: 'completion' },
                { name: 'Read 20 pages of history daily', goalType: 'days', goalTarget: 30 }
            ]
        };

        return templates[childType] || templates.student;
    };

    const useTemplate = (template) => {
        setName(template.name);
        setGoalType(template.goalType);
        if (template.goalTarget) {
            setGoalTarget(template.goalTarget);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onCreate({
            childId: selectedChildId,
            name: name.trim(),
            description: description.trim(),
            goalType,
            goalTarget: goalType === 'completion' ? null : parseInt(goalTarget),
            endDate: endDate || null,
            currentBook: currentBook.trim() || null
        });
    };

    if (children.length === 0) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
                <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-xl font-semibold mb-3 text-gray-800">Add a Child First</h2>
                    <p className="text-gray-600 mb-5">You need to add at least one child before setting a reading goal.</p>
                    <button 
                        className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium hover:bg-gray-300"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-semibold mb-5 text-gray-800">
                    Set a Reading Goal
                </h2>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Goal for: *</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={selectedChildId}
                            onChange={(e) => setSelectedChildId(e.target.value)}
                            required
                        >
                            {children.map(child => (
                                <option key={child.id} value={child.id}>
                                    {child.name} {child.grade ? `(Grade ${child.grade})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Quick Templates */}
                    <div className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Quick Ideas:</label>
                        <div className="grid grid-cols-1 gap-2">
                            {getTemplates().map((template, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => useTemplate(template)}
                                    className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-sm text-left rounded-lg transition-colors border border-purple-200"
                                >
                                    {template.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">What's the goal? *</label>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Read a chapter book together"
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Additional notes (optional)</label>
                        <textarea
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Any details or reminders..."
                            rows={2}
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Tracking type</label>
                        <select
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={goalType}
                            onChange={(e) => setGoalType(e.target.value)}
                        >
                            <option value="completion">Simple goal (mark complete when done)</option>
                            <option value="books">Number of books</option>
                            <option value="minutes">Number of minutes</option>
                            <option value="days">Number of days</option>
                        </select>
                    </div>

                    {goalType !== 'completion' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Target</label>
                            <input
                                type="number"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={goalTarget}
                                onChange={(e) => setGoalTarget(e.target.value)}
                                min="1"
                            />
                        </div>
                    )}

                    {goalType === 'completion' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Currently reading (optional)</label>
                            <input
                                type="text"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                value={currentBook}
                                onChange={(e) => setCurrentBook(e.target.value)}
                                placeholder="e.g., Charlotte's Web"
                            />
                        </div>
                    )}

                    <div className="mb-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">End date (optional)</label>
                        <input
                            type="date"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                        />
                    </div>

                    <button type="submit" className="w-full bg-purple-600 text-white py-3.5 px-6 rounded-lg font-medium hover:bg-purple-700 transition-all mb-2">
                        Set Goal
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

// Onboarding Modal - Multi-step welcome flow for new users
function OnboardingModal({ onComplete, onSkip }) {
    const [step, setStep] = useState(1);
    const [familyName, setFamilyName] = useState('');
    const [kids, setKids] = useState([{ name: '', ageGroup: 'student', grade: '', favoriteGenres: [] }]);
    const [readingTime, setReadingTime] = useState('');
    const [library, setLibrary] = useState('');
    const [readingGoal, setReadingGoal] = useState('');

    const genres = [
        '📖 Picture Books', '🧚 Fantasy', '🦁 Animals', '🚀 Science Fiction',
        '🔍 Mystery', '📚 Chapter Books', '🎭 Humor', '⚽ Sports',
        '🦖 Non-Fiction', '🧪 Science', '🏰 Fairy Tales', '🎨 Art & Crafts'
    ];

    const addKid = () => {
        setKids([...kids, { name: '', ageGroup: 'student', grade: '', favoriteGenres: [] }]);
    };

    const updateKid = (index, field, value) => {
        const newKids = [...kids];
        newKids[index][field] = value;
        setKids(newKids);
    };

    const toggleGenre = (index, genre) => {
        const newKids = [...kids];
        const genres = newKids[index].favoriteGenres || [];
        if (genres.includes(genre)) {
            newKids[index].favoriteGenres = genres.filter(g => g !== genre);
        } else {
            newKids[index].favoriteGenres = [...genres, genre];
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
            <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Progress Bar */}
                <div className="flex gap-1 mb-6">
                    {[...Array(totalSteps)].map((_, i) => (
                        <div 
                            key={i} 
                            className={`flex-1 h-1.5 rounded-full ${i < step ? 'bg-purple-600' : 'bg-gray-200'}`}
                        />
                    ))}
                </div>

                {/* Step 1: Welcome */}
                {step === 1 && (
                    <div className="text-center">
                        <div className="text-5xl mb-4">🔖</div>
                        <h2 className="text-2xl font-bold text-purple-800 mb-4">The My Bookmark Story</h2>
                        
                        <div className="text-gray-600 space-y-3 text-left mb-6">
                            <p className="font-medium text-gray-800">Every family has a reading story.</p>
                            <p className="text-gray-600">
                                From Goodnight Moon at 6 months<br />
                                to Harry Potter at 10 years<br />
                                to college reading lists at 18.<br />
                                It's a journey worth remembering.
                            </p>
                            <p>
                                My Bookmark helps you mark every moment,
                                track every page, and bookmark the memories that matter.
                            </p>
                        </div>
                        
                        <p className="font-semibold text-purple-700 mb-6">Let's set up your family library! 🔖</p>
                        
                        <button
                            onClick={() => setStep(2)}
                            className="w-full bg-purple-600 text-white py-3.5 rounded-lg font-medium hover:bg-purple-700 transition-all"
                        >
                            Get Started
                        </button>
                        
                        <button
                            onClick={onSkip}
                            className="w-full mt-3 text-gray-400 text-sm hover:text-gray-600 transition-all"
                        >
                            I'll set up later
                        </button>
                    </div>
                )}

                {/* Step 2: Family Name */}
                {step === 2 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">👨‍👩‍👧‍👦 What's your family name?</h2>
                        <p className="text-gray-500 text-sm mb-6">We'll personalize your reading library.</p>
                        
                        <input
                            type="text"
                            value={familyName}
                            onChange={(e) => setFamilyName(e.target.value)}
                            placeholder="e.g., Smith, Johnson, Garcia"
                            className="w-full p-4 border-2 border-gray-200 rounded-xl text-lg focus:border-purple-500 focus:ring-0 mb-4"
                            autoFocus
                        />
                        
                        <p className="text-center text-purple-600 font-medium mb-6">
                            🔖 {familyName || 'Your'} Family's Bookmark
                        </p>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(3)}
                                className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Add Kids */}
                {step === 3 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">👶 Who are your readers?</h2>
                        <p className="text-gray-500 text-sm mb-4">Add the children you'll be tracking reading for.</p>
                        
                        <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                            {kids.map((kid, index) => (
                                <div key={index} className="p-4 bg-purple-50 rounded-xl">
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={kid.name}
                                            onChange={(e) => updateKid(index, 'name', e.target.value)}
                                            placeholder="Child's name"
                                            className="flex-1 p-3 border border-gray-200 rounded-lg focus:border-purple-500"
                                        />
                                        {kids.length > 1 && (
                                            <button
                                                onClick={() => removeKid(index)}
                                                className="px-3 text-red-500 hover:bg-red-50 rounded-lg"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                    <select
                                        value={kid.ageGroup}
                                        onChange={(e) => updateKid(index, 'ageGroup', e.target.value)}
                                        className="w-full p-3 border border-gray-200 rounded-lg focus:border-purple-500 mb-2"
                                    >
                                        <option value="baby">👶 Baby (0-18 months)</option>
                                        <option value="toddler">🧒 Toddler (18 mo - 3 years)</option>
                                        <option value="preschool">🎨 Preschool (3-5 years)</option>
                                        <option value="student">🎒 Student (K-12)</option>
                                        <option value="homeschool">🏠 Homeschool Student</option>
                                    </select>
                                    {(kid.ageGroup === 'student' || kid.ageGroup === 'homeschool') && (
                                        <input
                                            type="text"
                                            value={kid.grade || ''}
                                            onChange={(e) => updateKid(index, 'grade', e.target.value)}
                                            placeholder="Grade (e.g., K, 1st, 5th)"
                                            className="w-full p-3 border border-gray-200 rounded-lg focus:border-purple-500"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        
                        <button
                            onClick={addKid}
                            className="w-full py-2 border-2 border-dashed border-purple-300 rounded-lg text-purple-600 font-medium hover:bg-purple-50 mb-4"
                        >
                            + Add Another Child
                        </button>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(2)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(4)}
                                className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Reading Interests */}
                {step === 4 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">📚 What do they love reading?</h2>
                        <p className="text-gray-500 text-sm mb-4">Select favorite genres for each child (optional).</p>
                        
                        <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                            {kids.map((kid, index) => (
                                kid.name.trim() ? (
                                    <div key={index} className="p-4 bg-gray-50 rounded-xl">
                                        <p className="font-medium text-gray-800 mb-3">{kid.name}'s favorites:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {genres.map(genre => (
                                                <button
                                                    key={genre}
                                                    type="button"
                                                    onClick={() => toggleGenre(index, genre)}
                                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                        (kid.favoriteGenres || []).includes(genre)
                                                            ? 'bg-purple-600 text-white'
                                                            : 'bg-white border border-gray-200 text-gray-600 hover:border-purple-300'
                                                    }`}
                                                >
                                                    {genre}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null
                            ))}
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(3)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setStep(5)}
                                className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5: Reading Habits & Library */}
                {step === 5 && (
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">🌙 A few more things...</h2>
                        <p className="text-gray-500 text-sm mb-4">Help us personalize your experience (all optional).</p>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    When do you usually read together?
                                </label>
                                <select
                                    value={readingTime}
                                    onChange={(e) => setReadingTime(e.target.value)}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:border-purple-500"
                                >
                                    <option value="">Select a time...</option>
                                    <option value="morning">🌅 Morning</option>
                                    <option value="afternoon">☀️ Afternoon</option>
                                    <option value="bedtime">🌙 Bedtime</option>
                                    <option value="varies">🔄 It varies</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    What's your reading goal?
                                </label>
                                <select
                                    value={readingGoal}
                                    onChange={(e) => setReadingGoal(e.target.value)}
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:border-purple-500"
                                >
                                    <option value="">Select a goal...</option>
                                    <option value="habit">📆 Build a daily reading habit</option>
                                    <option value="school">🏫 Meet school reading requirements</option>
                                    <option value="fun">🎉 Just for fun!</option>
                                    <option value="challenge">🏆 Reading challenges & competitions</option>
                                    <option value="homeschool">📝 Homeschool documentation</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    🏛️ Your local library (optional)
                                </label>
                                <input
                                    type="text"
                                    value={library}
                                    onChange={(e) => setLibrary(e.target.value)}
                                    placeholder="e.g., Main Street Public Library"
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:border-purple-500"
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(4)}
                                className="flex-1 py-3 border-2 border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleComplete}
                                className="flex-1 bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700"
                            >
                                🎉 Start Reading!
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Settings Modal - Manage family, kids, backup/restore
function SettingsModal({ 
    familyProfile, 
    setFamilyProfile, 
    children, 
    onAddChild, 
    onDeleteChild, 
    classGroups,
    onJoinClass,
    onCreateClass,
    onLeaveClass,
    onExport, 
    onImport, 
    onClose 
}) {
    const [activeTab, setActiveTab] = useState('family');
    const [importing, setImporting] = useState(false);
    const [editingFamily, setEditingFamily] = useState(false);
    const [familyName, setFamilyName] = useState(familyProfile?.familyName || '');

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
        reader.readAsText(file);
    };

    const saveFamilyName = () => {
        setFamilyProfile({ ...familyProfile, familyName: familyName.trim() || 'My' });
        setEditingFamily(false);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-5 z-50" onClick={onClose}>
            <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-semibold text-gray-800">⚙️ Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b">
                    <button
                        onClick={() => setActiveTab('family')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'family' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
                    >
                        👨‍👩‍👧 Family
                    </button>
                    <button
                        onClick={() => setActiveTab('kids')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'kids' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
                    >
                        👶 Kids
                    </button>
                    <button
                        onClick={() => setActiveTab('data')}
                        className={`flex-1 py-3 text-sm font-medium ${activeTab === 'data' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500'}`}
                    >
                        💾 Data
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-96">
                    {/* Family Tab */}
                    {activeTab === 'family' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-purple-50 rounded-xl">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-medium text-gray-700">Family Name</span>
                                    {!editingFamily && (
                                        <button onClick={() => setEditingFamily(true)} className="text-xs text-purple-600">Edit</button>
                                    )}
                                </div>
                                {editingFamily ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={familyName}
                                            onChange={(e) => setFamilyName(e.target.value)}
                                            className="flex-1 p-2 border rounded-lg text-sm"
                                            placeholder="Family name"
                                        />
                                        <button onClick={saveFamilyName} className="px-3 py-2 bg-purple-600 text-white text-sm rounded-lg">Save</button>
                                    </div>
                                ) : (
                                    <p className="text-lg font-semibold text-purple-800">{familyProfile?.familyName || 'My'} Family</p>
                                )}
                            </div>

                            {familyProfile?.readingTime && (
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <span className="text-xs text-gray-500">Reading time: </span>
                                    <span className="text-sm font-medium">{familyProfile.readingTime}</span>
                                </div>
                            )}

                            {familyProfile?.readingGoal && (
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <span className="text-xs text-gray-500">Goal: </span>
                                    <span className="text-sm font-medium">{familyProfile.readingGoal}</span>
                                </div>
                            )}

                            {familyProfile?.library && (
                                <div className="p-3 bg-gray-50 rounded-lg">
                                    <span className="text-xs text-gray-500">Library: </span>
                                    <span className="text-sm font-medium">{familyProfile.library}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Kids Tab */}
                    {activeTab === 'kids' && (
                        <div className="space-y-4">
                            <button 
                                onClick={onAddChild}
                                className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700"
                            >
                                ➕ Add Child
                            </button>

                            {/* Class Group Actions */}
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={onJoinClass}
                                    className="py-2 px-3 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg"
                                >
                                    👥 Join Class
                                </button>
                                <button 
                                    onClick={onCreateClass}
                                    className="py-2 px-3 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-lg"
                                >
                                    🏫 Create Class
                                </button>
                            </div>

                            {children.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <div className="text-4xl mb-2">👶</div>
                                    <p className="text-sm">No children added yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {children.map(child => {
                                        const childClasses = classGroups.filter(group => 
                                            group.students.some(s => s.childId === child.id)
                                        );
                                        return (
                                            <div key={child.id} className="p-4 bg-gray-50 rounded-xl">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="font-semibold text-gray-800">{child.name}</div>
                                                        <div className="text-xs text-gray-500">{child.childType}</div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`Remove ${child.name}?`)) onDeleteChild(child.id);
                                                        }}
                                                        className="text-xs text-red-500 hover:text-red-700"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                                {child.favoriteGenres?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {child.favoriteGenres.slice(0, 3).map(g => (
                                                            <span key={g} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{g}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {childClasses.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-gray-200">
                                                        <p className="text-xs text-gray-500 mb-1">Classes:</p>
                                                        {childClasses.map(cls => (
                                                            <div key={cls.id} className="flex justify-between items-center text-xs">
                                                                <span>{cls.name}</span>
                                                                <button onClick={() => onLeaveClass(cls.id, child.id)} className="text-red-500">Leave</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Data Tab */}
                    {activeTab === 'data' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-xs text-yellow-800">
                                    💡 <strong>Tip:</strong> Export your data regularly to prevent data loss. Your data is stored locally in your browser.
                                </p>
                            </div>

                            <button
                                onClick={onExport}
                                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                            >
                                📤 Export Backup
                            </button>

                            {!importing ? (
                                <button
                                    onClick={() => setImporting(true)}
                                    className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
                                >
                                    📥 Import Backup
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <input
                                        type="file"
                                        accept=".json"
                                        onChange={handleFileSelect}
                                        className="w-full p-2 border border-green-300 rounded-lg text-sm"
                                    />
                                    <button
                                        onClick={() => setImporting(false)}
                                        className="w-full py-2 text-gray-600 text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}

                            <div className="pt-4 border-t">
                                <p className="text-xs text-gray-400 text-center">
                                    Data is stored in your browser's local storage.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t">
                    <button
                        onClick={onClose}
                        className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300"
                    >
                        Close
                    </button>
                </div>
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
                    ⚙️ Backup & Restore
                </h2>

                {/* Export Section */}
                <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
                    <h3 className="font-semibold text-blue-900 mb-2">📤 Backup Your Data</h3>
                    <p className="text-sm text-blue-700 mb-3">
                        Download a backup file of all your reading data. Keep it safe!
                    </p>
                    <button
                        onClick={onExport}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-all"
                    >
                        Download Backup File
                    </button>
                </div>

                {/* Import Section */}
                <div className="mb-5 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                    <h3 className="font-semibold text-green-900 mb-2">📥 Restore From Backup</h3>
                    <p className="text-sm text-green-700 mb-3">
                        Restore your data from a backup file. This will replace your current data.
                    </p>
                    {!importing ? (
                        <button
                            onClick={() => setImporting(true)}
                            className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-all"
                        >
                            Choose Backup File
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
                                    ? 'bg-purple-600 text-white' 
                                    : 'bg-gray-100 text-gray-600'
                            }`}
                        >
                            👤 {child.name}
                        </button>
                        <button
                            onClick={() => setCardType('family')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                cardType === 'family' 
                                    ? 'bg-purple-600 text-white' 
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
                        className="bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-5 text-white mb-4 shadow-xl"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                        <div className="text-center mb-4">
                            <div className="text-2xl mb-1">🔖</div>
                            <div className="text-xs opacity-75 uppercase tracking-wider">My Bookmark</div>
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
                                        className="w-12 h-16 object-cover rounded shadow-lg"
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
                        className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-5 text-white mb-4 shadow-xl"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                    >
                        <div className="text-center mb-4">
                            <div className="text-2xl mb-1">🔖</div>
                            <div className="text-xs opacity-75 uppercase tracking-wider">My Bookmark</div>
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
                        className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-all disabled:opacity-50"
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
