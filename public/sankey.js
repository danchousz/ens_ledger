document.addEventListener('DOMContentLoaded', () => {
    const buttonContainer = document.getElementById('buttonContainer');
    const TEXTPAD = 3;

    let categoryMode = false;
    let currentWalletFilter = null;

    let currentQuarter = 'big_picture';
    const specialWallets = ['Ecosystem', 'Public Goods', 'Metagov', 'Community WG', 'Service Providers']; // Payment Accounts

    // Function to set the position of the node labels. 
    // Stadard plotly sankey diagram does not support node labels alignment.
    function sankeyNodeLabelsAlign(position, forcePos) {
        const textAnchor = {left: 'end', right: 'start', center: 'middle'}[position];
        const nodes = document.getElementsByClassName('sankey-node');

        for (const node of nodes) {
            const d = node.__data__;
            const label = node.getElementsByClassName('node-label').item(0);

            label.setAttribute('x', 0);

            if (!d.horizontal)
                continue;
            const padX = d.nodeLineWidth / 2 + TEXTPAD;
            const posX = padX + d.visibleWidth;
            let x;
            switch (position) {
                case 'left':
                    if (d.left || d.node.originalLayer === 0 && !forcePos)
                        continue;
                    x = -posX - padX;
                    break;

                case 'right':
                    if (!d.left || !forcePos)
                        continue;
                    x = posX + padX;
                    break;

                case 'center':
                    if (!forcePos && (d.left || d.node.originalLayer === 0))
                        continue;
                    x = (d.nodeLineWidth + d.visibleWidth) / 2 + (d.left ? padX : -posX);
                    break;
            }
            label.setAttribute('x', x);
            label.setAttribute('text-anchor', textAnchor);
        }
    };

    const createButton = (quarter) => {
        const button = document.createElement('button');
        button.className = 'button-81';
        button.textContent = quarter;
        button.dataset.quarter = quarter;
        button.addEventListener('click', () => {
            drawSankey(button.dataset.quarter);
        });
        return button;
    };

    const createSpecialWalletButton = (wallet) => {
        const button = document.createElement('button');
        button.className = 'button-81';
        button.textContent = wallet;
        button.dataset.wallet = wallet;
        button.addEventListener('click', () => {
            currentWalletFilter = wallet;
            drawSankey(currentQuarter, wallet);
        });
        return button;
    };

    fetch('/quarters')
        .then(response => response.json())
        .then(data => {
            data.quarters.forEach(quarter => {
                const button = createButton(quarter);
                buttonContainer.appendChild(button);
            });

            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'toggle-label';
            toggleLabel.textContent = 'Category Mode: ';
            const toggleSwitch = document.createElement('label');
            toggleSwitch.className = 'toggle-switch';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.addEventListener('change', () => {
                categoryMode = input.checked;
                drawSankey(currentQuarter, currentWalletFilter);
            });
            const span = document.createElement('span');
            span.className = 'slider';
            toggleSwitch.appendChild(input);
            toggleSwitch.appendChild(span);
            toggleLabel.appendChild(toggleSwitch);
            buttonContainer.appendChild(toggleLabel);

            drawSankey('big_picture');
        });

    const drawSankey = (quarter, walletFilter = null) => {
        currentQuarter = quarter;
        currentWalletFilter = walletFilter;

        fetch(`/data/${quarter}?category=${categoryMode}${walletFilter ? `&wallet=${walletFilter}` : ''}`)
            .then(response => response.json())
            .then(data => {
                const sankeyData = {
                    type: "sankey",
                    orientation: "h",
                    node: {
                        pad: 15,
                        thickness: 20,
                        line: {
                            color: "grey",
                        },
                        label: data.nodes.map(node => node.name),
                        customdata: data.nodes.map(node => node.customdata),
                        color: data.nodes.map(node => node.color),
                        x: data.nodes.map(node => node.x),
                        y: data.nodes.map(node => node.y),
                        hovertemplate: '%{label}',
                    },
                    link: {
                        source: data.links.map(link => link.source),
                        target: data.links.map(link => link.target),
                        value: data.links.map(link => link.value),
                        color: data.links.map(link => link.color),
                        line: {
                            color: "grey",
                        },
                        customdata: data.links.map(link => link.label),
                        hovertemplate: '%{customdata}<extra></extra>'
                    }
                };

                let shapes = [];
                let annotations = [];

                    if (quarter === 'big_picture') {
                        const quarterCount = data.conditions.quarterCount;
                        const border = 0.01;
                        const quarterNumber = (1 - border) / quarterCount;
                        let currentYear = 2022;
                        let currentQuarterIndex = 2;
                        for (let i = 1; i <= quarterCount; i++) {
                            const lineX = i * quarterNumber + border;

                            if (categoryMode) {
                                shapes.push({
                                    type: 'line',
                                    x0: -0.05,
                                    y0: 1.015,
                                    x1: 1.05,
                                    y1: 1.015,
                                    xref: 'paper',
                                    yref: 'paper',
                                    line: {
                                        color: 'grey',
                                        width: 1,
                                        dash: 'solid'
                                    }
                                });

                                shapes.push({
                                    type: 'line',
                                    x0: lineX,
                                    y0: -0.05,
                                    x1: lineX,
                                    y1: 1.05,
                                    xref: 'paper',
                                    yref: 'paper',
                                    line: {
                                        color: 'grey',
                                        width: 1,
                                        dash: 'solid'
                                    }
                                });

                                annotations.push({
                                    x: ((i - 1) * quarterNumber + border + lineX) / 2,
                                    y: 1.025,
                                    xref: 'paper',
                                    yref: 'paper',
                                    font: {
                                        size: 38,
                                        color: 'black'
                                    },
                                    showarrow: false,
                                    text: `${currentYear}Q${currentQuarterIndex}`,
                                    xanchor: 'center',
                                    yanchor: 'middle'
                                });

                                currentQuarterIndex++;
                                if (currentQuarterIndex > 4) {
                                    currentQuarterIndex = 1;
                                    currentYear++;
                                }

                                layout = {
                                    width: 3000,
                                    height: 2650,
                                    margin: { l: 0, r: 0, t: 100, b: 100 },
                                    shapes: shapes,
                                    annotations: annotations,
                                    font: {
                                        size: 10
                                    }
                                };
                            }

                            else if (!categoryMode) {
                                shapes.push({
                                    type: 'line',
                                    x0: -0.05,
                                    y0: 1,
                                    x1: 1.05,
                                    y1: 1,
                                    xref: 'paper',
                                    yref: 'paper',
                                    line: {
                                        color: 'grey',
                                        width: 1,
                                        dash: 'solid'
                                    }
                                });

                                shapes.push({
                                    type: 'line',
                                    x0: lineX,
                                    y0: -0.05,
                                    x1: lineX,
                                    y1: 1.05,
                                    xref: 'paper',
                                    yref: 'paper',
                                    line: {
                                        color: 'grey',
                                        width: 1,
                                        dash: 'solid'
                                    }
                                });

                                annotations.push({
                                    x: ((i - 1) * quarterNumber + border + lineX) / 2,
                                    y: 1.005,
                                    xref: 'paper',
                                    yref: 'paper',
                                    font: {
                                        size: 44,
                                        color: 'black'
                                    },
                                    showarrow: false,
                                    text: `${currentYear}Q${currentQuarterIndex}`,
                                    xanchor: 'center',
                                    yanchor: 'middle'
                                });

                                currentQuarterIndex++;
                                if (currentQuarterIndex > 4) {
                                    currentQuarterIndex = 1;
                                    currentYear++;
                                }

                                layout = {
                                    width: 5000,
                                    height: 6000,
                                    margin: { l: 0, r: 0, t: 100, b: 100 },
                                    shapes: shapes,
                                    annotations: annotations,
                                    font: {
                                        size: 12
                                    }
                                };
                            }
                        };

                    } else { layout = {
                        width: 1420,
                        height: 1000,
                        margin: { l: 0, r: 0, t: 150, b: 200 },
                        };
                    }

                const sankeyDiv = document.getElementById('sankeyDiagram');
                Plotly.react(sankeyDiv, [sankeyData], layout).then(() => {
                    sankeyNodeLabelsAlign('start', true);
                });
    
                const activeSpecialWallets = new Set(data.nodes.map(node => node.name).filter(name => specialWallets.includes(name)));
                document.querySelectorAll('.special-wallet-button').forEach(btn => btn.remove());
                activeSpecialWallets.forEach(wallet => {
                    const button = createSpecialWalletButton(wallet);
                    button.classList.add('special-wallet-button');
                    buttonContainer.appendChild(button);
                });
    
                document.querySelectorAll('.button-81').forEach(btn => btn.classList.remove('active'));
                document.querySelector(`.button-81[data-quarter="${quarter}"]`).classList.add('active');
            });
    };

    document.getElementById('saveSvgButton').addEventListener('click', () => {
        const sankeyDiv = document.getElementById('sankeyDiagram');
        Plotly.downloadImage(sankeyDiv, {format: 'svg', filename: 'sankey_diagram'});
    });

    drawSankey('big_picture');
});