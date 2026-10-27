'use strict';

const GITHUB_USERNAME = 'FaiGiJoon';
const MAX_REPOS = 6;

async function fetchGitHubRepos() {
    const container = document.getElementById('github-repos-container');
    if (!container) return;

    try {
        const response = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=pushed&per_page=100`);
        if (!response.ok) throw new Error(`GitHub API responded with ${response.status}`);

        const repos = (await response.json())
            // Skip forks, archived repos and this website's own repo
            .filter(repo => !repo.fork && !repo.archived && repo.name.toLowerCase() !== `${GITHUB_USERNAME.toLowerCase()}.github.io`)
            .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
            .slice(0, MAX_REPOS);

        container.setAttribute('aria-busy', 'false');

        if (repos.length === 0) {
            renderMessage(container, 'No public projects yet.', 'New work will show up here as soon as it is on GitHub.');
            return;
        }
        renderRepos(repos, container);
    } catch (error) {
        console.error('Error fetching GitHub repos:', error);
        container.setAttribute('aria-busy', 'false');
        renderMessage(container, 'Projects couldn’t be loaded right now.', 'GitHub may be rate-limiting requests. You can browse them directly on GitHub instead.');
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function safeUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' ? u.href : '#';
    } catch (e) {
        return '#';
    }
}

function prettyName(name) {
    return name.replace(/[-_]+/g, ' ');
}

function formatUpdated(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return `Updated ${date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
}

function renderMessage(container, title, body) {
    container.innerHTML = `
        <div class="col-span-full glass-card p-8 text-center">
            <p class="font-semibold text-gray-100">${escapeHtml(title)}</p>
            <p class="text-gray-400 text-sm mt-2">${escapeHtml(body)}</p>
        </div>`;
}

function renderRepos(repos, container) {
    container.innerHTML = '';

    repos.forEach(repo => {
        const card = document.createElement('a');
        card.href = safeUrl(repo.html_url);
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.className = 'glass-card is-interactive reveal p-6 flex flex-col group';
        card.setAttribute('aria-label', `${prettyName(repo.name)} on GitHub (opens in a new tab)`);

        card.innerHTML = `
            <div class="flex items-start justify-between mb-5">
                <span class="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center" aria-hidden="true">
                    <i data-lucide="folder-git-2" class="w-5 h-5 text-primary-light"></i>
                </span>
                <i data-lucide="arrow-up-right" class="w-5 h-5 text-gray-500 group-hover:text-primary-light transition-colors" aria-hidden="true"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-100 mb-2">${escapeHtml(prettyName(repo.name))}</h3>
            <p class="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3">${escapeHtml(repo.description || 'No description yet.')}</p>
            <div class="mt-auto flex items-center gap-4 text-xs text-gray-400">
                ${repo.language ? `
                    <span class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full bg-accent" aria-hidden="true"></span>
                        ${escapeHtml(repo.language)}
                    </span>` : ''}
                ${repo.stargazers_count > 0 ? `
                    <span class="flex items-center gap-1">
                        <i data-lucide="star" class="w-3.5 h-3.5" aria-hidden="true"></i>
                        ${escapeHtml(repo.stargazers_count)}
                    </span>` : ''}
                <span class="ml-auto">${escapeHtml(formatUpdated(repo.pushed_at))}</span>
            </div>
        `;

        container.appendChild(card);
    });

    if (globalThis.lucide) {
        globalThis.lucide.createIcons();
    }
    if (globalThis.observeReveals) {
        globalThis.observeReveals(container);
    } else {
        container.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
    }
}

document.addEventListener('DOMContentLoaded', fetchGitHubRepos);
