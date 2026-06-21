const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  registerCandidate: (data) => ipcRenderer.invoke('register-candidate', data),
  loginCandidate: (data) => ipcRenderer.invoke('login-candidate', data),
  getQuestions: (data) => ipcRenderer.invoke('get-questions', data),
  saveExamResult: (data) => ipcRenderer.invoke('save-exam-result', data),
  getExamResults: () => ipcRenderer.invoke('get-exam-results'),
  getAllSubjects: () => ipcRenderer.invoke('get-all-subjects'),
  insertQuestions: (data) => ipcRenderer.invoke('insert-questions', data)
});
