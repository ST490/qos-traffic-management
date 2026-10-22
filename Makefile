.PHONY: setup dev run-sim test clean

setup:
	pip install -r requirements.txt
	cd frontend && npm install

dev:
	@echo "Starting backend and frontend..."
	start /B python -m backend.run
	cd frontend && npm run dev

run-sim:
	python -m backend.run

test:
	python -m pytest tests/ -v

clean:
	rm -f qos_data.db
	rm -rf __pycache__ backend/__pycache__ traffic/__pycache__
