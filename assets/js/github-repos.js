'use strict';

const REPOS_TO_SHOW = 4;
let allRepos = [];

async function fetchGitHubRepos() {
    const username = 'FaiGiJoon';
    const container = document.getElementById('github-repos-container');
    const showMoreContainer = document.getElementById('show-more-container');
    const showMoreBtn = document.getElementById('show-more-btn');

    if (!container) return;

    try {
        const response = await fetch(`https://api.github.com/users/${username}/repos`);
        if (!response.ok) throw new Error('Failed to fetch repositories');

        allRepos = await response.json();

        // Filter out forks and sort by most recent pushed_at
        allRepos = allRepos
            .filter(repo => !repo.fork)
            .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

        renderRepos(allRepos.slice(0, REPOS_TO_SHOW), container);

        if (allRepos.length > REPOS_TO_SHOW) {
            showMoreContainer.classList.remove('hidden');
            showMoreBtn.addEventListener('click', () => {
                renderRepos(allRepos, container);
                showMoreContainer.classList.add('hidden');
            });
        }
    } catch (error) {
        console.error('Error fetching GitHub repos:', error);
        container.innerHTML = `<p class="text-center text-red-400 col-span-full">Failed to load projects. Please try again later.</p>`;
    }
}

function renderRepos(repos, container) {
    container.innerHTML = '';

    repos.forEach(repo => {
        const card = document.createElement('div');
        card.className = 'glass-card rounded-2xl p-6 reveal border-2 border-primary/20 hover:border-primary/50 transition-all group flex flex-col h-full';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div class="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <i data-lucide="folder" class="w-6 h-6 text-primary"></i>
                </div>
                <div class="flex gap-3">
                    <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="text-gray-400 hover:text-primary transition-colors" title="View Source">
                        <i data-lucide="github" class="w-5 h-5"></i>
                    </a>
                    ${repo.homepage ? `
                        <a href="${repo.homepage}" target="_blank" rel="noopener noreferrer" class="text-gray-400 hover:text-primary transition-colors" title="Live Demo">
                            <i data-lucide="external-link" class="w-5 h-5"></i>
                        </a>
                    ` : ''}
                </div>
            </div>
            <h3 class="text-xl font-bold mb-2 group-hover:text-primary transition-colors">${repo.name}</h3>
            <p class="text-gray-400 text-sm mb-6 flex-grow">${repo.description || 'No description available.'}</p>
            <div class="flex items-center gap-4 mt-auto">
                ${repo.language ? `
                    <div class="flex items-center gap-1.5">
                        <span class="w-3 h-3 rounded-full bg-primary"></span>
                        <span class="text-xs font-medium text-gray-300">${repo.language}</span>
                    </div>
                ` : ''}
                <div class="flex items-center gap-1.5">
                    <i data-lucide="star" class="w-4 h-4 text-yellow-500"></i>
                    <span class="text-xs font-medium text-gray-300">${repo.stargazers_count}</span>
                </div>
                <div class="flex items-center gap-1.5 ml-auto">
                    <i data-lucide="clock" class="w-4 h-4 text-gray-500"></i>
                    <span class="text-xs font-medium text-gray-400">Updated ${new Date(repo.pushed_at).toLocaleDateString()}</span>
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    container.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', fetchGitHubRepos);
